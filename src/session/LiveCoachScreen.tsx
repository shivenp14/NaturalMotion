import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { AnatomyViewport } from '../anatomy/AnatomyViewport';
import { LiveClient } from '../live/LiveClient';
import type { FormReport, LiveAction } from '../live/protocol';
import type { PoseObservation } from '../shared/contracts';
import type { LiveAudio } from '../voice/LiveAudio.types';
import { createLiveAudio, requestLiveMicrophonePermission } from '../voice/LiveAudio';
import { getCameraPermission, requestCameraPermission } from 'react-native-pose-detection';
import { CameraPoseView } from '../vision/CameraPoseView';
import { isFreshFrame, toPoseObservation, type PoseFrameLike } from '../vision/landmarks';
import { deriveFormPlan, SequenceFormEvaluator } from '../vision/checks/registry';
import { theme } from '../ui/theme';
import { useSession } from './SessionProvider';
import { appendCleanup } from './cleanup';
import { PracticeMotionDetector } from '../vision/practiceMotion';

export function LiveCoachScreen() {
  const session = useSession();
  const [mainView, setMainView] = useState<'model' | 'camera'>('camera');
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const autoStarted = useRef(false);
  const motion = useRef(new PracticeMotionDetector());
  const [practiceDetected, setPracticeDetected] = useState(false);
  const lastPlaybackStatus = useRef<string | undefined>(undefined);
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
  const [, setStats] = useState({ microphone: 0, images: 0, peak: 0 });
  const [mode, setMode] = useState<'live' | 'local' | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('Connecting your conversation…');
  const [planning, setPlanning] = useState(false);
  const [cameraWarning, setCameraWarning] = useState('');
  const [, setReport] = useState<FormReport | null>(null);
  const [practiceStartedAt, setPracticeStartedAt] = useState<number | null>(null);
  const practice = useRef<number | null>(null);
  useEffect(() => { practice.current = practiceStartedAt; }, [practiceStartedAt]);
  const lastReport = useRef('');
  const lastFormSentAt = useRef(0);
  const backendUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

  const stop = useCallback(async (reason = 'Session stopped. Camera and microphone released.') => {
    const run = ++epoch.current;
    healthRequest.current?.abort(); healthRequest.current = null;
    client.current?.stop(); client.current = null;
    const previous = audio.current; audio.current = null;
    observation.current = null; poseClock.current = null; evaluator.current.reset(); motion.current.reset(); mutedRef.current = false; setMuted(false); setPracticeDetected(false); lastReport.current = '';
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

  async function start(nextMode: 'live' | 'local', streamMicrophone = true) {
    if (pending || mode) return;
    if (Platform.OS !== 'android') { setMessage('Voice conversations are currently available on Android.'); return; }
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
        const cameraPermission = await getCameraPermission();
        if (!cameraPermission.granted && !(await requestCameraPermission()).granted) throw new Error('Camera permission is required.');
        await requestLiveMicrophonePermission();
      } finally { permitting.current = false; }
      if (run !== epoch.current || !mounted.current) return;
      if (AppState.currentState !== 'active') throw new Error('Return to the app and start the session again.');
      counters.current = { microphone: 0, images: 0, peak: 0 }; setStats({ ...counters.current });
      setCameraWarning(''); setMainView('camera'); setPracticeDetected(false); motion.current.reset(); setMode(nextMode);
      if (nextMode === 'live') {
        const context = latest.current;
        const connection = new LiveClient({ baseUrl: backendUrl!, context: { type: 'context', sequence: context.sequence, playback: context.playback },
          apply: (action: LiveAction) => {
            if (run !== epoch.current || !mounted.current) throw new Error('Session is cancelled.');
            if (action.type === 'play_sequence') {
              const checked = latest.current.acceptSequence(action.sequence);
              if (!checked.ok) throw new Error(checked.error);
              practice.current = null; setPracticeStartedAt(null); setReport(null); lastReport.current = ''; motion.current.reset(); setPracticeDetected(false); setMainView('model');
            } else if (action.type === 'stop_movement') { latest.current.reset(); practice.current = null; setPracticeStartedAt(null); setReport(null); }
            else if (action.type === 'pause_movement') { latest.current.setPaused(true); practice.current = null; setPracticeStartedAt(null); }
            else if (action.type === 'resume_movement') latest.current.setPaused(false);
            else throw new Error('Unknown movement action.');
          },
          onMessage: event => {
            if (run !== epoch.current || !mounted.current) return;
            if (event.type === 'audio') audio.current?.enqueue(event.data);
            if (event.type === 'interrupted') audio.current?.interrupt();
            if (event.type === 'turn_complete') audio.current?.finishReply();
            if (event.type === 'planning') setPlanning(event.active);

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
        if (streamMicrophone && !mutedRef.current) client.current?.send({ type: 'audio', data });
      }, error => { if (run === epoch.current) void stop(error); }, warning => {
        if (run === epoch.current && mounted.current) setCameraWarning(warning);
      });
      if (run === epoch.current && mounted.current && nextMode === 'live') client.current?.send({ type: 'text', text: 'Please greet me briefly and ask what stretch I would like to do or where I feel sore. Do not start a demonstration until I respond.' });
      if (run === epoch.current && mounted.current) setMessage(nextMode === 'local'
        ? 'Local devices test. Audio and images stay on this phone. The speaker button plays a test tone.'
        : streamMicrophone ? 'Live camera and microphone connected. Ask for a demonstration.'
          : 'Live text test. Camera and providers are connected; microphone input stays local so speech cannot interrupt typed requests.');
    } catch (error) {
      if (run === epoch.current) await stop(error instanceof Error ? error.message : 'Could not start the live coach.');
    } finally { if (run === epoch.current && mounted.current) setPending(false); }
  }

  useEffect(() => {
    if (!autoStarted.current) { autoStarted.current = true; void start('live'); }
  // Start once after the user opens this screen; retry is available after an error.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPose(frame: PoseFrameLike) {
    if (!isFreshFrame(poseClock.current, frame.timestamp)) return;
    poseClock.current = frame.timestamp ?? null;
    observation.current = toPoseObservation(frame, Date.now());
    const current = latest.current;
    if (current.sequence && current.playback?.status === 'completed' && !practiceDetected && motion.current.update(observation.current)) {
      setPracticeDetected(true); setMainView('camera');
      if (deriveFormPlan(current.sequence).has(current.sequence.steps.length - 1)) { const now = Date.now(); practice.current = now; setPracticeStartedAt(now); }
    }
    evaluate();
  }
  const canPractice = session.sequence && session.playback?.status === 'completed' &&
    deriveFormPlan(session.sequence).has(session.sequence.steps.length - 1);
  useEffect(() => {
    const status = session.playback?.status;
    if (status === 'playing' && !lastPlaybackStatus.current) setMainView('model');
    if (status === 'completed' && canPractice && practiceDetected && practice.current === null) { const now = Date.now(); practice.current = now; setPracticeStartedAt(now); }
    lastPlaybackStatus.current = status;
  }, [session.playback?.status, canPractice, practiceDetected]);
  const connectionMarker = pending ? 'live-starting' : mode === 'live' ? 'live-connected' : mode === 'local' ? 'live-local-ready' : 'live-stopped';
  const playbackMarker = !session.sequence ? 'idle' : !session.playback ? 'preparing' :
    session.playback.status === 'playing' ? 'active' : session.playback.status;

  if (mode) return <SafeAreaView style={styles.callScreen} testID="live-screen">
    <View style={styles.callStage} testID={connectionMarker}>
      <View style={[styles.stageLayer, mainView === 'camera' ? styles.mainLayer : styles.callPreview]} testID="live-camera">
        <CameraPoseView onFrame={onPose} onCameraImage={image => {
          counters.current.images++;
          if (Date.now() - image.observedAt < 2000) client.current?.send({ type: 'image', data: image.data, observedAt: image.observedAt });
        }} onError={(error, fatal) => { if (!fatal) setCameraWarning(error); else void stop(error); }} />
      </View>
      <View style={[styles.stageLayer, mainView === 'model' ? styles.mainLayer : styles.callPreview]} testID="live-model">
        <AnatomyViewport sequence={session.sequence} paused={session.paused} onPlaybackChange={session.recordPlayback} showLab={false} stage />
      </View>
      <Pressable testID="live-swap" accessibilityRole="button" accessibilityLabel={mainView === 'camera' ? 'Show anatomy model' : 'Show camera and start practice'} style={styles.previewTouch} onPress={() => {
        if (mainView === 'model') { setMainView('camera'); setPracticeDetected(true); if (canPractice) { const now = Date.now(); practice.current = now; setPracticeStartedAt(now); } }
        else setMainView('model');
      }}><Text style={styles.callPreviewLabel}>{mainView === 'camera' ? 'Anatomy' : 'You'}</Text></Pressable>
      {planning && <View pointerEvents="none" style={styles.callStatus}><Text style={styles.statusText}>Preparing your demonstration…</Text></View>}
      {!!cameraWarning && <Text style={styles.warning} accessibilityRole="alert">{cameraWarning}</Text>}
      <View style={styles.callButtons}>
        <Pressable testID="live-mute" accessibilityRole="button" accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'} accessibilityState={{ selected: muted }} onPress={() => { mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); }} style={styles.roundButton}><View style={styles.micIcon}><View style={styles.micCapsule} /><View style={styles.micArc} /><View style={styles.micStem} />{muted && <View style={styles.micSlash} />}</View></Pressable>
        <Pressable testID="live-end" accessibilityRole="button" accessibilityLabel="End conversation" onPress={() => void stop().then(() => router.back())} style={styles.roundButton}><Text style={styles.roundText}>×</Text></Pressable>
      </View>
      <Text testID={`live-playback-${playbackMarker}`} style={styles.hiddenMarker} accessibilityElementsHidden>{playbackMarker}</Text>
    </View>
  </SafeAreaView>;

  return <SafeAreaView style={styles.callScreen} testID="live-screen">
    <View style={styles.connecting} testID={connectionMarker}>
      <Text style={styles.connectingText} accessibilityLiveRegion="polite">{message}</Text>
      {!pending && Platform.OS === 'android' && <Pressable testID="live-start" accessibilityRole="button" onPress={() => void start('live')} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable>}
      <Pressable testID="live-end" accessibilityRole="button" onPress={() => void stop().then(() => router.back())} style={styles.cancelButton}><Text style={styles.cancelText}>Back</Text></Pressable>
    </View>
  </SafeAreaView>;

}

const styles = StyleSheet.create({
  connecting: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  connectingText: { color: '#292929', textAlign: 'center', fontSize: 16, lineHeight: 24 },
  retryButton: { backgroundColor: '#252525', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  retryText: { color: '#fff', fontWeight: '600' },
  cancelButton: { padding: 12 },
  cancelText: { color: '#596778', fontWeight: '600' },
  callScreen: { flex: 1, backgroundColor: '#ffffff' },
  callStage: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#ffffff' },
  callPreview: { left: 20, bottom: 24, width: 105, height: 150, borderRadius: 18, borderWidth: 2, borderColor: '#fff', zIndex: 2 },
  previewTouch: { position: 'absolute', left: 20, bottom: 24, width: 105, height: 150, borderRadius: 18, zIndex: 4, justifyContent: 'flex-end', padding: 5 },
  callPreviewLabel: { overflow: 'hidden', backgroundColor: 'rgba(25,25,25,0.88)', color: '#fff', fontSize: 11, textAlign: 'center', borderRadius: 10, paddingVertical: 4 },
  callButtons: { position: 'absolute', right: 20, bottom: 28, zIndex: 4, flexDirection: 'row', gap: 12 },
  callStatus: { position: 'absolute', top: 18, left: 20, right: 20, zIndex: 3, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 16, padding: 12 },
  warning: { position: 'absolute', top: 100, left: 20, right: 20, zIndex: 3, color: '#222', backgroundColor: '#fff', padding: 8 },
  micIcon: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' },
  micCapsule: { position: 'absolute', top: 2, width: 9, height: 15, borderWidth: 1.6, borderColor: '#fff', borderRadius: 6 },
  micArc: { position: 'absolute', top: 9, width: 17, height: 12, borderWidth: 1.5, borderTopWidth: 0, borderColor: '#fff', borderBottomLeftRadius: 9, borderBottomRightRadius: 9 },
  micStem: { position: 'absolute', top: 21, width: 1.5, height: 4, backgroundColor: '#fff' },
  micSlash: { position: 'absolute', width: 27, height: 2, backgroundColor: '#fff', transform: [{ rotate: '-45deg' }] },
  hiddenMarker: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  top: { paddingLeft: 16, paddingRight: __DEV__ ? 76 : 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: theme.text, fontSize: 20, fontWeight: '600', flexShrink: 1 },
  content: { padding: 16, gap: 16, maxWidth: 600, width: '100%', alignSelf: 'center' },
  note: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  status: { color: theme.text, fontSize: 14, lineHeight: 20 },
  stage: { position: 'relative', overflow: 'hidden', borderRadius: 24, backgroundColor: '#ffffff' },
  stageLayer: { position: 'absolute', overflow: 'hidden', backgroundColor: '#ffffff' },
  mainLayer: { top: 0, bottom: 0, left: 0, right: 0, zIndex: 0 },
  previewLayer: { left: 16, bottom: 18, width: 116, height: 158, borderRadius: 18, zIndex: 2 },
  previewLabel: { position: 'absolute', bottom: 10, left: 10, color: '#fff', fontSize: 10, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  stageHeader: { position: 'absolute', top: 18, left: 16, right: 16, zIndex: 3, alignItems: 'flex-start', gap: 12 },
  stageBadge: { overflow: 'hidden', color: '#fff', backgroundColor: '#303030', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, fontSize: 11, fontWeight: '700' },
  captionCard: { backgroundColor: 'rgba(245,245,245,0.92)', padding: 14, borderRadius: 16, maxWidth: '85%' },
  statusText: { color: '#292929', fontSize: 14, lineHeight: 20 },
  stageControls: { position: 'absolute', right: 16, bottom: 18, zIndex: 3, gap: 10 },
  roundButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#303030', alignItems: 'center', justifyContent: 'center' },
  endButton: { backgroundColor: '#666666' },
  roundText: { color: '#fff', fontSize: 24, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { minHeight: 48, justifyContent: 'center', padding: 14, borderRadius: 14, backgroundColor: theme.border },
  smallButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.surface },
  buttonText: { color: theme.accent, fontSize: 13, fontWeight: '600' },
  panel: { gap: 8, padding: 14, borderRadius: 16, backgroundColor: theme.surface },
  input: { minHeight: 70, color: theme.text, padding: 8, textAlignVertical: 'top' },
  speaker: { color: theme.accent, fontWeight: '600' },
});
