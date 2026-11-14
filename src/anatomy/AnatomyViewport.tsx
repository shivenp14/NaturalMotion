import { Component, useCallback, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MovementSequence, PlaybackState } from '../shared/contracts';
import { theme } from '../ui/theme';
import { anatomyAppearance } from './appearance';
import { anatomyFocusOptions, type AnatomyFocus, type AnatomyView } from './regions';
import { SceneCanvas } from './SceneCanvas';

export type AnatomyViewportProps = {
  sequence: MovementSequence | null;
  /** Reserved for movement playback; this viewer does not execute sequences. */
  onPlaybackChange?: (state: PlaybackState) => void;
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

export function AnatomyViewport({ sequence }: AnatomyViewportProps) {
  const [focus, setFocus] = useState<AnatomyFocus>('none');
  const [view, setView] = useState<AnatomyView>('front');
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <View style={styles.viewport}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>YOUR MOVEMENT GUIDE</Text>
        <Text style={styles.title}>Explore your anatomy</Text>
      </View>
      <View style={styles.canvas} accessibilityLabel={`Anatomical model, ${view} view. ${focus === 'none' ? 'Neutral gray' : focus.replace('_', ' ')} focus.`}>
        <ModelBoundary>
          <SceneCanvas focus={focus} view={view} onReady={onReady} />
          {!ready && (
            <View style={styles.loading} pointerEvents="none">
              <ActivityIndicator color={theme.accent} />
              <Text style={styles.caption}>Preparing anatomy…</Text>
            </View>
          )}
        </ModelBoundary>
      </View>
      <View style={styles.controls}>
        <View style={styles.row} accessibilityLabel="Body view">
          {(['front', 'back', 'side'] as const).map((option) => (
            <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: view === option }}
              onPress={() => setView(option)} style={[styles.control, view === option && styles.selected]}>
              <Text style={[styles.controlText, view === option && styles.selectedText]}>{option[0].toUpperCase() + option.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Region focus</Text>
        <View style={styles.row}>
          {anatomyFocusOptions.map((option) => (
            <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: focus === option.id }}
              onPress={() => { setFocus(option.id); if (option.id === 'upper_back') setView('back'); }}
              style={[styles.control, focus === option.id && styles.selected]}>
              <Text style={[styles.controlText, focus === option.id && styles.selectedText]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.caption}>Educational region focus · not a measurement of muscle activation</Text>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://github.com/heatsy-app/heatsy-body-model').catch(() => {}); }}>
          <Text style={styles.credit}>Heatsy / Z-Anatomy / BodyParts3D · CC BY-SA 4.0</Text>
        </Pressable>
        {__DEV__ && sequence && <Text style={styles.caption}>Sequence playback is not connected yet.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { backgroundColor: anatomyAppearance.background, borderRadius: 24, overflow: 'hidden' },
  heading: { gap: 8, paddingHorizontal: 20, paddingTop: 22 },
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
