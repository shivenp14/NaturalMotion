import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { AnatomyViewport } from '../anatomy/AnatomyViewport';
import { createWallAngelReference } from '../anatomy/upperBodySequence';
import { wallAngelDefaults } from '../anatomy/wallAngel';
import { LiveClient } from '../live/LiveClient';
import type { FormReport, LiveAction, LiveControl } from '../live/protocol';
import type { PoseObservation } from '../shared/contracts';
import type { LiveAudio } from '../voice/LiveAudio.types';
import { createLiveAudio, requestLiveMicrophonePermission } from '../voice/LiveAudio';
import { requestCameraPermission } from 'react-native-pose-detection';
import { CameraPoseView } from '../vision/CameraPoseView';
import { isFreshFrame, toPoseObservation, type PoseFrameLike } from '../vision/landmarks';
import { deriveFormPlan, SequenceFormEvaluator } from '../vision/checks/registry';
import { theme } from '../ui/theme';
import { useSession } from './SessionProvider';
import { appendCleanup } from './cleanup';

export function LiveCoachScreen() {
  const session = useSession();
  const latest = useRef(session);
  useEffect(() => { latest.current = session; }, [session]);
  const mounted = useRef(true);
  const epoch = useRef(0);
  const permitting = useRef(false);
  const client = useRef<LiveClient | null>(null);
  const audio = useRef<LiveAudio | null>(null);
  const stopping = useRef<Promise<void>>(Promise.resolve());
  const healthRequest = useRef<AbortController | null>(null);
  const observation = useRef<PoseObservation | null>(null);
  const poseClock = useRef<number | null>(null);
  const evaluator = useRef(new SequenceFormEvaluator());
  const counters = useRef({ microphone: 0, images: 0, peak: 0 });
  const [stats, setStats] = useState({ microphone: 0, images: 0, peak: 0 });
  const [mode, setMode] = useState<'live' | 'local' | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('Start a live session, or test the camera, microphone and speaker locally.');
  const [planning, setPlanning] = useState(false);
  const [cameraWarning, setCameraWarning] = useState('');
  const [report, setReport] = useState<FormReport | null>(null);
  const [practiceStartedAt, setPracticeStartedAt] = useState<number | null>(null);
  const practice = useRef<number | null>(null);
  useEffect(() => { practice.current = practiceStartedAt; }, [practiceStartedAt]);
  const lastReport = useRef('');
  const lastFormSentAt = useRef(0);
  const [turns, setTurns] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [text, setText] = useState('Show me a wall angel demonstration, then return to a goalpost position.');
  const backendUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

  const stop = useCallback(async (reason = 'Session stopped. Camera and microphone released.') => {
    const run = ++epoch.current;
    healthRequest.current?.abort(); healthRequest.current = null;
    client.current?.stop(); client.current = null;
    const previous = audio.current; audio.current = null;
    observation.current = null; poseClock.current = null; evaluator.current.reset(); lastReport.current = '';
    latest.current.reset(); practice.current = null;
    if (mounted.current) { setPending(true); setMode(null); setPlanning(false); setReport(null); setPracticeStartedAt(null); }
    stopping.current = appendCleanup(stopping.current, previous ? () => previous.stop() : undefined);
    await stopping.current;
    if (mounted.current && run === epoch.current) { setPending(false); setMessage(reason); }
  }, []);

  useFocusEffect(useCallback(() => () => { void stop(); }, [stop]));

  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', state => {
      if (state === 'background' && !permitting.current) void stop();
    });
    return () => { mounted.current = false; listener.remove(); void stop(); };
  }, [stop]);

  useEffect(() => {
    client.current?.send({ type: 'context', sequence: session.sequence, playback: session.playback, practiceStartedAt });
  }, [session.sequence, session.playback, practiceStartedAt]);

  const evaluate = useCallback(() => {
    const context = latest.current;
    const result = evaluator.current.evaluate(context.sequence, context.playback, observation.current, Date.now(), practice.current);
    const key = result ? JSON.stringify([result.sequenceId, result.stepIndex, result.status, result.mode]) : '';
    if (mounted.current) {
      const changed = key !== lastReport.current;
      if (changed) { lastReport.current = key; setReport(result); }
      if (result && (changed || Date.now() - lastFormSentAt.current >= 1000)) {
        lastFormSentAt.current = Date.now(); client.current?.send({ type: 'form', report: result });
      }
    }
  }, []);
  useEffect(() => {
    if (!mode) return;
    const timer = setInterval(() => { evaluate(); if (mounted.current) setStats({ ...counters.current }); }, 200);
    return () => clearInterval(timer);
  }, [mode, evaluate]);

  async function start(nextMode: 'live' | 'local') {
    if (pending || mode || Platform.OS !== 'android') return;
    const run = ++epoch.current;
    setPending(true); setMessage(nextMode === 'live' ? 'Connecting the live coach…' : 'Preparing a local devices test…');
    try {
      await stopping.current;
      if (nextMode === 'live') {
        if (!backendUrl) throw new Error('Set EXPO_PUBLIC_API_BASE_URL to the backend address.');
        const request = new AbortController(); healthRequest.current = request;
        const timeout = setTimeout(() => request.abort(), 10000);
        let response: Response;
        try { response = await fetch(`${backendUrl.replace(/\/$/, '')}/live/health`, { signal: request.signal }); }
        finally { clearTimeout(timeout); if (healthRequest.current === request) healthRequest.current = null; }
        if (!response.ok) throw new Error('Live backend is unavailable.');
        const health = await response.json();
        if (!health.conversationConfigured) throw new Error('Configure GEMINI_API_KEY on the backend first.');
        if (!health.plannerConfigured) throw new Error('Configure OPENAI_API_KEY on the backend for movement planning.');
      }
      if (run !== epoch.current || !mounted.current) return;
      permitting.current = true;
      try {
        if (!(await requestCameraPermission()).granted) throw new Error('Camera permission is required.');
        await requestLiveMicrophonePermission();
      } finally { permitting.current = false; }
      if (run !== epoch.current || !mounted.current) return;
      if (AppState.currentState !== 'active') throw new Error('Return to the app and start the session again.');
      counters.current = { microphone: 0, images: 0, peak: 0 }; setStats({ ...counters.current });
      setTurns([]); setCameraWarning(''); setMode(nextMode);
      if (nextMode === 'live') {
        const context = latest.current;
        const connection = new LiveClient({ baseUrl: backendUrl!, context: { type: 'context', sequence: context.sequence, playback: context.playback },
          apply: (action: LiveAction) => {
            if (run !== epoch.current || !mounted.current) throw new Error('Session is cancelled.');
            if (action.type === 'play_sequence') {
              const checked = latest.current.acceptSequence(action.sequence);
              if (!checked.ok) throw new Error(checked.error);
              practice.current = null; setPracticeStartedAt(null); setReport(null); lastReport.current = '';
            } else if (action.type === 'stop_movement') { latest.current.reset(); practice.current = null; setPracticeStartedAt(null); setReport(null); }
            else if (action.type === 'pause_movement') { latest.current.setPaused(true); practice.current = null; setPracticeStartedAt(null); }
            else if (action.type === 'resume_movement') latest.current.setPaused(false);
            else throw new Error('Unknown movement action.');
          },
          onMessage: event => {
            if (run !== epoch.current || !mounted.current) return;
            if (event.type === 'audio') audio.current?.enqueue(event.data);
            if (event.type === 'interrupted') audio.current?.interrupt();
            if (event.type === 'planning') setPlanning(event.active);
            if (event.type === 'transcript') setTurns(previous => {
              const last = previous.at(-1);
              return last?.role === event.role ? [...previous.slice(0, -1), { role: event.role, text: (last.text + event.text).slice(-4000) }] :
                [...previous, { role: event.role, text: event.text }].slice(-20);
            });
          },
          onClose: reason => { if (run === epoch.current && mounted.current) void stop(reason); },
        });
        client.current = connection;
        await connection.start();
      }
      if (run !== epoch.current || !mounted.current) return;
      const driver = createLiveAudio(); audio.current = driver;
      await driver.start((data, peak) => {
        if (run !== epoch.current) return;
        counters.current.microphone++; counters.current.peak = peak;
        client.current?.send({ type: 'audio', data });
      }, error => { if (run === epoch.current) void stop(error); });
      if (run === epoch.current && mounted.current) setMessage(nextMode === 'local'
        ? 'Local devices test. Audio and images stay on this phone. The speaker button plays a test tone.'
        : 'Live camera and microphone connected. Ask for a demonstration.');
    } catch (error) {
      if (run === epoch.current) await stop(error instanceof Error ? error.message : 'Could not start the live coach.');
    } finally { if (run === epoch.current && mounted.current) setPending(false); }
  }

  function control(name: LiveControl) {
    if (name === 'stop_movement') { latest.current.reset(); practice.current = null; setPracticeStartedAt(null); setReport(null); }
    else { latest.current.setPaused(name === 'pause_movement'); practice.current = null; setPracticeStartedAt(null); }
    client.current?.send({ type: 'control', name });
  }
  function onPose(frame: PoseFrameLike) {
    if (!isFreshFrame(poseClock.current, frame.timestamp)) return;
    poseClock.current = frame.timestamp ?? null;
    observation.current = toPoseObservation(frame, Date.now()); evaluate();
  }
  const canPractice = session.sequence && session.playback?.status === 'completed' &&
    deriveFormPlan(session.sequence).has(session.sequence.steps.length - 1);
  const connectionMarker = pending ? 'live-starting' : mode === 'live' ? 'live-connected' : mode === 'local' ? 'live-local-ready' : 'live-stopped';
  const playbackMarker = !session.sequence ? 'idle' : !session.playback ? 'preparing' :
    session.playback.status === 'playing' ? 'active' : session.playback.status;

  return (
    <SafeAreaView style={styles.screen} testID="live-screen">
      <View style={styles.top} testID={connectionMarker}>
        <Pressable accessibilityRole="button" onPress={() => void stop().then(() => router.back())} style={styles.smallButton}><Text style={styles.buttonText}>Back</Text></Pressable>
        <Text style={styles.title} testID={`live-playback-${playbackMarker}`}>Live coach</Text>
        <Pressable testID="live-end" accessibilityRole="button" onPress={() => void stop()} style={styles.smallButton}><Text style={styles.buttonText}>End coach</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.note}>Live mode sends microphone audio and sampled camera images to the conversation provider. Pose checks run locally. Face the phone with your shoulders, elbows and ears visible.</Text>
        <Text style={styles.status} accessibilityLiveRegion="polite">{message}{planning ? '\nPlanning a validated demonstration…' : ''}</Text>
        {!mode && <View style={styles.row}>
          <Pressable testID="live-start" accessibilityRole="button" disabled={pending} accessibilityState={{ disabled: pending }} onPress={() => void start('live')} style={styles.button}><Text style={styles.buttonText}>{pending ? 'Preparing…' : 'Start live coach'}</Text></Pressable>
          {__DEV__ && <Pressable testID="live-local-start" accessibilityRole="button" disabled={pending} onPress={() => void start('local')} style={styles.button}><Text style={styles.buttonText}>Test devices locally</Text></Pressable>}
        </View>}
        {mode && <>
          <View style={styles.camera} testID="live-camera">
            <CameraPoseView onFrame={onPose} onCameraImage={image => {
              counters.current.images++;
              if (Date.now() - image.observedAt < 2000) client.current?.send({ type: 'image', data: image.data, observedAt: image.observedAt });
            }} onError={(error, fatal) => {
              if (!fatal) { setCameraWarning(error); return; }
              void stop(error);
            }} />
          </View>
          {!!cameraWarning && <Text style={styles.note}>{cameraWarning}</Text>}
          <Text style={styles.note}>Mic packets: {stats.microphone} · Camera samples: {stats.images} · Mic level: {stats.peak.toFixed(3)}{mode === 'local' ? ' · LOCAL TEST' : ''}</Text>
        </>}
        <AnatomyViewport sequence={session.sequence} paused={session.paused}
          onPlaybackChange={session.recordPlayback} showLab={false} compact />
        <Text style={styles.status}>{report ? `${report.mode === 'practice' ? 'Practice · ' : ''}${report.message}` : 'No active form check.'}</Text>
        {session.sequence && <>
          <Text style={styles.note}>{session.playback ? `Step ${session.playback.stepIndex + 1} · ${session.playback.phase} · ${session.playback.status}` : 'Preparing demonstration…'}</Text>
          <View style={styles.row}>
            <Pressable testID={session.paused ? 'live-resume' : 'live-pause'} accessibilityRole="button" onPress={() => control(session.paused ? 'resume_movement' : 'pause_movement')} style={styles.button}><Text style={styles.buttonText}>{session.paused ? 'Resume movement' : 'Pause movement'}</Text></Pressable>
            <Pressable testID="live-clear" accessibilityRole="button" onPress={() => control('stop_movement')} style={styles.button}><Text style={styles.buttonText}>Clear movement</Text></Pressable>
            {!!canPractice && <Pressable accessibilityRole="button" onPress={() => setPracticeStartedAt(Date.now())} style={styles.button}><Text style={styles.buttonText}>Check final goalpost position</Text></Pressable>}
          </View>
        </>}
        {mode === 'live' && <View style={styles.panel}>
          <TextInput testID="live-request" accessibilityLabel="Live text request" style={styles.input} multiline value={text} onChangeText={setText} />
          <Pressable testID="live-send" accessibilityRole="button" disabled={pending} accessibilityState={{ disabled: pending }} onPress={() => { if (!pending && text.trim()) client.current?.send({ type: 'text', text }); }} style={styles.button}><Text style={styles.buttonText}>Send text to live coach</Text></Pressable>
        </View>}
        {mode === 'local' && <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => audio.current?.testSpeaker()} style={styles.button}><Text style={styles.buttonText}>Test speaker tone</Text></Pressable>
          <Pressable testID="live-local-reference" accessibilityRole="button" onPress={() => {
            const reference = createWallAngelReference(wallAngelDefaults, `local-reference-${Date.now()}`);
            const last = reference.steps.at(-1)!; if ('parallel' in last) last.holdSeconds = 2;
            const checked = session.acceptSequence(reference); if (!checked.ok) setMessage(checked.error);
          }} style={styles.button}><Text style={styles.buttonText}>Play authored reference</Text></Pressable>
        </View>}
        {turns.map((turn, index) => <View key={index} style={styles.panel}><Text style={styles.speaker}>{turn.role === 'user' ? 'You' : 'Guide'}</Text><Text selectable style={styles.note}>{turn.text}</Text></View>)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  top: { paddingLeft: 16, paddingRight: __DEV__ ? 76 : 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: theme.text, fontSize: 20, fontWeight: '600', flexShrink: 1 },
  content: { padding: 16, gap: 16, maxWidth: 600, width: '100%', alignSelf: 'center' },
  note: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  status: { color: theme.text, fontSize: 14, lineHeight: 20 },
  camera: { height: 220, overflow: 'hidden', borderRadius: 16, backgroundColor: theme.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { minHeight: 48, justifyContent: 'center', padding: 14, borderRadius: 14, backgroundColor: theme.border },
  smallButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.surface },
  buttonText: { color: theme.accent, fontSize: 13, fontWeight: '600' },
  panel: { gap: 8, padding: 14, borderRadius: 16, backgroundColor: theme.surface },
  input: { minHeight: 70, color: theme.text, padding: 8, textAlignVertical: 'top' },
  speaker: { color: theme.accent, fontWeight: '600' },
});
