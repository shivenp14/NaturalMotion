import { Component, useCallback, useMemo, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MovementSequence, PlaybackState } from '../shared/contracts';
import { theme } from '../ui/theme';
import { anatomyAppearance } from './appearance';
import { anatomyFocusOptions, type AnatomyFocus, type AnatomyView } from './regions';
import { SceneCanvas } from './SceneCanvas';
import { wallAngelDefaults, type WallAngelPreview } from './wallAngel';
import { compileUpperBodySequence, createWallAngelReference } from './upperBodySequence';
import { UpperBodyControlLab } from './UpperBodyControlLab';
import { initialUpperBodyPose, type UpperBodyPose } from './upperBodyPose';

export type AnatomyViewportProps = {
  sequence: MovementSequence | null;
  onPlaybackChange?: (state: PlaybackState) => void;
  paused?: boolean;
};

class ModelBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <View style={styles.fallback} accessibilityRole="alert">
        <Text style={styles.caption}>The anatomy preview couldn’t load. Restart the app to try again.</Text>
      </View>
    );
    return this.props.children;
  }
}

export function AnatomyViewport({ sequence, onPlaybackChange, paused = false }: AnatomyViewportProps) {
  const [focus, setFocus] = useState<AnatomyFocus>('none');
  const [view, setView] = useState<AnatomyView>('front');
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<WallAngelPreview>({ mode: 'rest', parameters: { ...wallAngelDefaults } });
  const [labSequence, setLabSequence] = useState<MovementSequence | null>(null);
  const [labPaused, setLabPaused] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [controlPose, setControlPose] = useState<UpperBodyPose | null>(null);
  const execution = useMemo(() => {
    const input = sequence ?? labSequence;
    if (!input) return { program: null, error: null };
    try { return { program: compileUpperBodySequence(input), error: null }; }
    catch (error) { return { program: null, error: error instanceof Error ? error.message : 'Unsupported movement sequence.' }; }
  }, [sequence, labSequence]);
  const onReady = useCallback(() => setReady(true), []);
  const onPreviewComplete = useCallback(() => setPreview((current) => ({ ...current, mode: 'completed' })), []);
  const onProgramPlayback = useCallback((state: PlaybackState) => {
    if (!sequence && state.status === 'completed') setPreview((current) => ({ ...current, mode: 'completed' }));
    onPlaybackChange?.(state);
  }, [sequence, onPlaybackChange]);
  function selectPose(mode: WallAngelPreview['mode']) {
    setControlPose(null);
    setControlsOpen(false);
    setLabSequence(null);
    setLabPaused(false);
    setPreview((current) => ({ ...current, mode }));
  }
  function playComposition() {
    setControlPose(null);
    setControlsOpen(false);
    if (labSequence && preview.mode !== 'completed') {
      setLabPaused((current) => !current);
      return;
    }
    setLabPaused(false);
    setLabSequence(createWallAngelReference(preview.parameters, `wall-angel-lab-${Date.now()}`));
    setPreview((current) => ({ ...current, mode: 'playing' }));
  }
  return (
    <View style={styles.viewport}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>YOUR MOVEMENT GUIDE</Text>
        <Text style={styles.title}>Explore your anatomy</Text>
      </View>
      {__DEV__ && !sequence && (
        <View style={styles.lab}>
          <Text style={styles.label}>Movement lab · Wall angel</Text>
          <View style={styles.row}>
            {(['rest', 'goalpost', 'midpoint', 'top'] as const).map((mode) => (
              <Pressable key={mode} accessibilityRole="button" disabled={!ready}
                accessibilityState={{ selected: preview.mode === mode, disabled: !ready }}
                onPress={() => selectPose(mode)} style={[styles.control, preview.mode === mode && styles.selected]}>
                <Text style={[styles.controlText, preview.mode === mode && styles.selectedText]}>{mode[0].toUpperCase() + mode.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" disabled={!ready} accessibilityState={{ disabled: !ready }}
              onPress={playComposition} style={styles.control}>
              <Text style={styles.controlText}>{labSequence && preview.mode !== 'completed' ? labPaused ? 'Resume' : 'Pause' : 'Play composition'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setLabSequence(null); setPreview((current) => ({ mode: 'goalpost', parameters: { ...current.parameters, topAngleDeg: current.parameters.topAngleDeg === 145 ? 125 : 145 } })); }} style={styles.control}>
              <Text style={styles.controlText}>Top: {preview.parameters.topAngleDeg}°</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setLabSequence(null); setPreview((current) => ({ mode: 'goalpost', parameters: { ...current.parameters, travelSeconds: current.parameters.travelSeconds === 3 ? 5 : 3 } })); }} style={styles.control}>
              <Text style={styles.controlText}>{preview.parameters.travelSeconds === 3 ? 'Normal speed' : 'Slower'}</Text>
            </Pressable>
          </View>
          <Text style={styles.caption} accessibilityLiveRegion="polite">{preview.mode === 'completed' ? 'Composition complete · goalpost' : labSequence ? labPaused ? 'Paused at current pose' : 'Playing composed primitives' : preview.mode === 'rest' ? 'Original rest pose' : `${preview.mode[0].toUpperCase() + preview.mode.slice(1)} pose`} · rig proof</Text>
        </View>
      )}
      <View style={styles.canvas} accessibilityLabel={`Anatomical model, ${view} view. ${execution.program ? 'Educational component regions' : focus === 'none' ? 'Neutral gray' : focus.replace('_', ' ')} focus.`}>
        <ModelBoundary>
          <SceneCanvas focus={focus} view={view} onReady={onReady} preview={__DEV__ && !sequence && !labSequence ? preview : undefined} onPreviewComplete={onPreviewComplete}
            pose={__DEV__ && !sequence ? controlPose : null}
            program={execution.program} playbackPaused={sequence ? paused : labPaused} onPlaybackChange={onProgramPlayback} />
          {!ready && (
            <View style={styles.loading} pointerEvents="none">
              <ActivityIndicator color={theme.accent} />
              <Text style={styles.caption}>Preparing anatomy…</Text>
            </View>
          )}
        </ModelBoundary>
      </View>
      <View style={styles.controls}>
        {__DEV__ && !sequence && <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: controlsOpen }} style={styles.control}
            onPress={() => {
              setControlsOpen(!controlsOpen);
              setControlPose(controlsOpen ? null : initialUpperBodyPose());
              setLabSequence(null);
              setLabPaused(false);
              setPreview((current) => ({ ...current, mode: 'rest' }));
            }}>
            <Text style={styles.controlText}>{controlsOpen ? 'Close upper-body controls' : 'Explore upper-body controls'}</Text>
          </Pressable>
          {controlsOpen && <UpperBodyControlLab ready={ready} onPoseChange={(pose) => {
            setControlPose(pose); setLabSequence(null); setLabPaused(false);
          }} onPlay={(input) => {
            setLabSequence(input); setLabPaused(false);
            setPreview((current) => ({ ...current, mode: 'playing' }));
          }} />}
        </>}
        <View style={styles.row} accessibilityLabel="Body view">
          {(['front', 'back', 'side'] as const).map((option) => (
            <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: view === option }}
              onPress={() => setView(option)} style={[styles.control, view === option && styles.selected]}>
              <Text style={[styles.controlText, view === option && styles.selectedText]}>{option[0].toUpperCase() + option.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>{execution.program ? 'Regions follow the active components' : 'Region focus'}</Text>
        {!execution.program && <View style={styles.row}>
          {[...anatomyFocusOptions, ...(__DEV__ ? [{ id: 'wall_angel' as const, label: 'Movement regions' }] : [])].map((option) => (
            <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: focus === option.id }}
              onPress={() => { setFocus(option.id); if (option.id === 'upper_back') setView('back'); }}
              style={[styles.control, focus === option.id && styles.selected]}>
              <Text style={[styles.controlText, focus === option.id && styles.selectedText]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>}
        <Text style={styles.caption}>Educational region focus · not a measurement of muscle activation</Text>
        {__DEV__ && (controlPose || preview.mode !== 'rest') && <Text style={styles.caption}>Illustrative rig preview · contact is not simulated. Angles are animation settings, not a recommended range.</Text>}
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://github.com/heatsy-app/heatsy-body-model').catch(() => {}); }}>
          <Text style={styles.credit}>Heatsy / Z-Anatomy / BodyParts3D · CC BY-SA 4.0</Text>
        </Pressable>
        {execution.error && <Text style={styles.caption} accessibilityRole="alert">Movement unavailable: {execution.error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { backgroundColor: anatomyAppearance.background, borderRadius: 24, overflow: 'hidden' },
  heading: { gap: 8, paddingHorizontal: 20, paddingTop: 22 },
  lab: { gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  eyebrow: { color: theme.accent, fontSize: 10, fontWeight: '600', letterSpacing: 1.8 },
  title: { color: theme.text, fontSize: 21, fontWeight: '500' },
  canvas: { height: 440, position: 'relative' },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'center', alignItems: 'center', gap: 12 },
  fallback: { height: 440, justifyContent: 'center', padding: 24 },
  controls: { padding: 20, paddingTop: 8, gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  control: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#1c2225' },
  selected: { backgroundColor: '#d5dbde' },
  controlText: { color: '#bac2c6', fontSize: 13 },
  selectedText: { color: '#151a1d', fontWeight: '600' },
  label: { color: theme.text, fontSize: 12, fontWeight: '500' },
  caption: { color: '#aab3b8', fontSize: 12, lineHeight: 18 },
  credit: { color: '#aab3b8', fontSize: 11, lineHeight: 17, textDecorationLine: 'underline', paddingVertical: 6 },
});
