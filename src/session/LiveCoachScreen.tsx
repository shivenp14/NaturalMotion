import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AnatomyViewport } from '../anatomy/AnatomyViewport';
import { createWallAngelReference } from '../anatomy/upperBodySequence';
import { wallAngelDefaults } from '../anatomy/wallAngel';
import { LiveClient } from '../live/LiveClient';
import type { LiveAction, LiveControl } from '../live/protocol';
import type { PracticeReview } from '../shared/practice';
import type { PlaybackState, PoseObservation } from '../shared/contracts';
import { plannedAvatarView } from '../shared/presentation';
import type { LiveAudio } from '../voice/LiveAudio.types';
import { createLiveAudio, requestLiveMicrophonePermission } from '../voice/LiveAudio';
import { getCameraPermission, requestCameraPermission } from 'react-native-pose-detection';
import { CameraPoseView } from '../vision/CameraPoseView';
import { isFreshFrame, toPoseObservation, type PoseFrameLike } from '../vision/landmarks';
import { SelfPacedPractice, type SelfPacedSnapshot } from '../vision/selfPacedPractice';
import { MicrophoneSilenceGate } from '../voice/microphoneGate';
import { theme } from '../ui/theme';
import { useSession } from './SessionProvider';
import { appendCleanup } from './cleanup';
import { CallStage } from '../ui/CallStage';
import { conversationTranscript } from '../live/transcript';

export function LiveCoachScreen() {
  const session = useSession();
  const params = useLocalSearchParams<{ diagnostics?: string }>();
  const diagnostics = __DEV__ && params.diagnostics === '1';
  const autoStarted = useRef(false);
  const mutedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [details, setDetails] = useState(false);
  const [mainView, setMainView] = useState<'camera' | 'model'>('camera');
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
  const practiceSession = useRef(new SelfPacedPractice());
  const microphoneGate = useRef(new MicrophoneSilenceGate());
  const counters = useRef({ microphone: 0, images: 0, peak: 0 });
  const [stats, setStats] = useState({ microphone: 0, images: 0, peak: 0 });
  const [mode, setMode] = useState<'live' | 'local' | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('Start a live session, or test the camera, microphone and speaker locally.');
  const [planning, setPlanning] = useState(false);
  const [cameraWarning, setCameraWarning] = useState('');
  const [report, setReport] = useState<PracticeReview | null>(null);
  const [practiceView, setPracticeView] = useState<SelfPacedSnapshot>({ stage: 'watching', recordingId: null, startedAt: null,
    attempt: null, review: null, message: 'Watch the demonstration first.' });
  const lastAttemptSent = useRef('');
  const lastPracticeId = useRef('');
  const [turns, setTurns] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [text, setText] = useState('');
  const backendUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

  const stop = useCallback(async (reason = 'Session stopped. Camera and microphone released.') => {
    const run = ++epoch.current;
    healthRequest.current?.abort(); healthRequest.current = null;
    client.current?.stop(); client.current = null;
    const previous = audio.current; audio.current = null;
    observation.current = null; poseClock.current = null; practiceSession.current.reset(); lastAttemptSent.current = ''; lastPracticeId.current = ''; microphoneGate.current.reset(); mutedRef.current = false; setMuted(false);
    latest.current.reset();
    if (mounted.current) { setPending(true); setMode(null); setPlanning(false); setReport(null); setPracticeView(practiceSession.current.snapshot); }
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
    client.current?.send({ type: 'context', sequence: session.sequence, playback: session.playback, practiceStartedAt: practiceView.startedAt, practiceStage: practiceView.stage });
  }, [session.sequence, session.playback, practiceView]);

  const evaluate = useCallback(() => {
    const context = latest.current;
    const now = Date.now();
    const view = practiceSession.current.update(context.sequence, context.assessmentPlan, context.playback, observation.current, now, context.paused);
    if (mounted.current) {
      setPracticeView(previous => previous === view ? previous : view);
      if (view.stage === 'performing') {
        setReport(previous => previous === null ? previous : null);
        if (view.recordingId !== lastPracticeId.current) { setMainView('camera'); audio.current?.interrupt(); lastPracticeId.current = view.recordingId ?? ''; }
      }
      if (view.review) setReport(previous => previous?.attemptId === view.review!.attemptId ? previous : view.review);
      if (view.attempt && view.attempt.attemptId !== lastAttemptSent.current && client.current) {
        client.current.send({ type: 'context', sequence: context.sequence, playback: context.playback, practiceStartedAt: view.startedAt, practiceStage: view.stage });
        client.current.send({ type: 'practice_attempt', attempt: view.attempt }); lastAttemptSent.current = view.attempt.attemptId;
      }
    }
    return view;
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
        if (!backendUrl) throw new Error(diagnostics ? 'Set EXPO_PUBLIC_API_BASE_URL to the backend address.' : 'The coach is not configured yet. Please try again later.');
        const request = new AbortController(); healthRequest.current = request;
        const timeout = setTimeout(() => request.abort(), 10000);
        let response: Response;
        try { response = await fetch(`${backendUrl.replace(/\/$/, '')}/live/health`, { signal: request.signal }); }
        finally { clearTimeout(timeout); if (healthRequest.current === request) healthRequest.current = null; }
        if (!response.ok) throw new Error('Live backend is unavailable.');
        const health = await response.json();
        if (!health.conversationConfigured) throw new Error(diagnostics ? 'Configure GEMINI_API_KEY on the backend first.' : 'Voice coaching is unavailable right now.');
        if (!health.plannerConfigured) throw new Error(diagnostics ? 'Configure OPENAI_API_KEY on the backend for movement planning.' : 'Movement coaching is unavailable right now.');
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
      setMainView('camera'); setTurns([]); setCameraWarning(''); setMode(nextMode);
      if (nextMode === 'live') {
        const context = latest.current;
        const connection = new LiveClient({ baseUrl: backendUrl!, context: { type: 'context', sequence: context.sequence, playback: context.playback },
          apply: (action: LiveAction) => {
            if (run !== epoch.current || !mounted.current) throw new Error('Session is cancelled.');
            if (action.type === 'play_sequence') {
              const checked = latest.current.acceptSequence(action.sequence, action.assessmentPlan, action.presentationPlan);
              if (!checked.ok) throw new Error(checked.error);
              practiceSession.current.reset(); setPracticeView(practiceSession.current.snapshot); setReport(null); lastAttemptSent.current = ''; setMainView('model');
            } else if (action.type === 'set_avatar_view') latest.current.setAvatarView(action.view);
            else if (action.type === 'start_practice') {
              evaluate(); practiceSession.current.requestStart(); setReport(null);
              const view = evaluate();
              client.current?.send({ type: 'context', sequence: latest.current.sequence, playback: latest.current.playback,
                practiceStartedAt: view.startedAt, practiceStage: view.stage });
            } else if (action.type === 'finish_practice') {
              if (practiceSession.current.snapshot.stage !== 'performing') throw new Error('No repetition is currently being recorded.');
              practiceSession.current.finish(Date.now()); evaluate();
            }
            else if (action.type === 'stop_movement') { latest.current.reset(); practiceSession.current.reset(); setPracticeView(practiceSession.current.snapshot); setReport(null); }
            else if (action.type === 'pause_movement') latest.current.setPaused(true);
            else if (action.type === 'resume_movement') latest.current.setPaused(false);
            else throw new Error('Unknown movement action.');
          },
          onMessage: event => {
            if (run !== epoch.current || !mounted.current) return;
            if (event.type === 'audio') audio.current?.enqueue(event.data);
            if (event.type === 'interrupted') audio.current?.interrupt();
            if (event.type === 'turn_complete') audio.current?.finishReply();
            if (event.type === 'planning') setPlanning(event.active);
            if (event.type === 'practice_review' && event.review.attemptId === practiceSession.current.snapshot.attempt?.attemptId) setReport(event.review);
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
      microphoneGate.current.reset();
      await driver.start((data, peak, durationMs = 100) => {
        if (run !== epoch.current) return;
        counters.current.microphone++; counters.current.peak = peak;
        if (streamMicrophone && !mutedRef.current) {
          try {
            const packets = microphoneGate.current.push({ data, peak, durationMs });
            for (const packet of packets.audio) client.current?.send({ type: 'audio', data: packet });
            if (packets.audioStreamEnd) client.current?.send({ type: 'audio_end' });
          } catch { void stop('Microphone audio could not be processed. Restart the live session.'); }
        }
      }, error => { if (run === epoch.current) void stop(error); }, warning => {
        if (run === epoch.current && mounted.current) setCameraWarning(warning);
      });
      if (run === epoch.current && mounted.current && nextMode === 'live' && !diagnostics) client.current?.send({ type: 'text', text: 'Please greet me briefly and ask where I feel stiff or what movement I would like help with. Wait for my response before demonstrating.' });
      if (run === epoch.current && mounted.current) setMessage(nextMode === 'local'
        ? 'Local devices test. Audio and images stay on this phone. The speaker button plays a test tone.'
        : streamMicrophone ? 'Live camera and microphone connected. Ask for a demonstration.'
          : 'Live text test. Camera and providers are connected; microphone input stays local so speech cannot interrupt typed requests.');
    } catch (error) {
      if (run === epoch.current) await stop(error instanceof Error ? error.message : 'Could not start the live coach.');
    } finally { if (run === epoch.current && mounted.current) setPending(false); }
  }

  useEffect(() => {
    if (!diagnostics && !autoStarted.current) { autoStarted.current = true; void start('live'); }
  // Start once on entry. Errors expose an explicit retry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostics]);

  function control(name: LiveControl) {
    if (name === 'stop_movement') { latest.current.reset(); practiceSession.current.reset(); setPracticeView(practiceSession.current.snapshot); setReport(null); }
    else latest.current.setPaused(name === 'pause_movement');
    client.current?.send({ type: 'control', name });
  }
  function onPose(frame: PoseFrameLike) {
    if (!isFreshFrame(poseClock.current, frame.timestamp)) return;
    poseClock.current = frame.timestamp ?? null;
    observation.current = toPoseObservation(frame, Date.now()); evaluate();
  }
  function recordPlayback(value: PlaybackState) {
    latest.current.recordPlayback(value);
  }
  const activePlayback = session.playback;
  const connectionMarker = pending ? 'live-starting' : mode === 'live' ? 'live-connected' : mode === 'local' ? 'live-local-ready' : 'live-stopped';
  const playbackMarker = !session.sequence ? 'idle' : !activePlayback ? 'preparing' :
    activePlayback.status === 'playing' ? 'active' : activePlayback.status;

  if (!diagnostics) return <SafeAreaView style={styles.screen} testID="live-screen">
    {mode ? <CallStage mainView={mainView} connectionMarker={connectionMarker}
      camera={<CameraPoseView onFrame={onPose} onCameraImage={image => {
        counters.current.images++;
        if (Date.now() - image.observedAt < 2000) client.current?.send({ type: 'image', data: image.data, observedAt: image.observedAt });
      }} onError={(error, fatal) => { if (fatal) void stop(error); else setCameraWarning(error); }} />}
      model={<AnatomyViewport sequence={session.sequence} paused={session.paused} viewPreference={session.avatarView}
        automaticView={plannedAvatarView(session.presentationPlan, session.sequence, activePlayback?.stepIndex ?? 0)}
        onPlaybackChange={recordPlayback} showLab={false} stage />}
      onSwap={() => setMainView(value => value === 'camera' ? 'model' : 'camera')}>
      <View style={styles.callStatus} pointerEvents="none">
        <Text style={styles.status} accessibilityLiveRegion="polite">{pending ? 'Connecting microphone… Please wait.' : planning ? 'Preparing your demonstration…' : report?.message ?? (session.sequence ? practiceView.message : 'Tell me where you feel stiff.')}</Text>
        {!!cameraWarning && <Text style={styles.note} accessibilityRole="alert">{cameraWarning}</Text>}
      </View>
      <View style={styles.callButtons}>
        <Pressable testID="live-details" accessibilityRole="button" accessibilityLabel="Open conversation and movement controls" onPress={() => setDetails(true)} style={styles.roundButton}><Text style={styles.roundText}>···</Text></Pressable>
        <Pressable testID="live-mute" accessibilityRole="button" accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'} accessibilityState={{ selected: muted }} onPress={() => {
          mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); microphoneGate.current.reset();
          if (mutedRef.current) client.current?.send({ type: 'audio_end' });
        }} style={styles.roundButton}><View style={styles.micIcon}><View style={styles.micCapsule} /><View style={styles.micArc} /><View style={styles.micStem} />{muted && <View style={styles.micSlash} />}</View></Pressable>
        <Pressable testID="live-end" accessibilityRole="button" accessibilityLabel="End conversation" onPress={() => void stop().then(() => router.back())} style={styles.roundButton}><Text style={styles.roundText}>×</Text></Pressable>
      </View>
      <Text testID={`live-playback-${playbackMarker}`} style={styles.hiddenMarker}>{playbackMarker}</Text>
    </CallStage> : <View style={styles.connecting} testID={connectionMarker}>
      <Text style={styles.status} accessibilityLiveRegion="polite">{pending ? 'Connecting your conversation…' : message}</Text>
      {!pending && Platform.OS === 'android' && <Pressable testID="live-start" accessibilityRole="button" onPress={() => void start('live')} style={styles.button}><Text style={styles.buttonText}>Try again</Text></Pressable>}
      <Pressable testID="live-end" accessibilityRole="button" onPress={() => void stop().then(() => router.back())} style={styles.smallButton}><Text style={styles.buttonText}>Back</Text></Pressable>
    </View>}
    <Modal visible={details && !!mode} animationType="slide" onRequestClose={() => setDetails(false)}>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.top}><Text style={styles.title}>Conversation</Text><Pressable accessibilityRole="button" onPress={() => setDetails(false)} style={styles.smallButton}><Text style={styles.buttonText}>Close</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.note}>{planning ? 'Preparing your demonstration…' : message}</Text>
            {session.sequence && <View style={styles.row}>
              <Pressable testID={session.paused ? 'live-resume' : 'live-pause'} accessibilityRole="button" onPress={() => control(session.paused ? 'resume_movement' : 'pause_movement')} style={styles.button}><Text style={styles.buttonText}>{session.paused ? 'Resume movement' : 'Pause movement'}</Text></Pressable>
              <Pressable testID="live-clear" accessibilityRole="button" onPress={() => control('stop_movement')} style={styles.button}><Text style={styles.buttonText}>Stop movement</Text></Pressable>
            </View>}
            {turns.map((turn, index) => <View key={index} style={styles.panel}><Text style={styles.speaker}>{turn.role === 'user' ? 'You' : 'Coach'}</Text><Text style={styles.status}>{conversationTranscript(turn.role, turn.text)}</Text></View>)}
            {mode === 'live' && <View style={styles.panel}>
              <TextInput testID="live-request" accessibilityLabel="Message your coach" placeholder="Message your coach…" placeholderTextColor={theme.muted} style={styles.input} multiline value={text} onChangeText={setText} />
              <Pressable testID="live-send" accessibilityRole="button" disabled={pending || !text.trim()} accessibilityState={{ disabled: pending || !text.trim() }} onPress={() => { if (!pending && text.trim()) { client.current?.send({ type: 'text', text: text.trim() }); setText(''); } }} style={styles.button}><Text style={styles.buttonText}>Send</Text></Pressable>
            </View>}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;

  return (
    <SafeAreaView style={styles.screen} testID="live-screen">
      <View style={styles.top} testID={connectionMarker}>
        <Pressable accessibilityRole="button" onPress={() => void stop().then(() => router.back())} style={styles.smallButton}><Text style={styles.buttonText}>Back</Text></Pressable>
        <Text style={styles.title} testID={`live-playback-${playbackMarker}`}>Live coach</Text>
        <Pressable testID="live-end" accessibilityRole="button" onPress={() => void stop()} style={styles.smallButton}><Text style={styles.buttonText}>End coach</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.note}>Live mode sends microphone audio and sampled camera images to the conversation provider. Pose checks run locally. Face the phone with your shoulders, elbows, wrists and hips visible.</Text>
        <Text style={styles.status} accessibilityLiveRegion="polite">{planning ? 'Preparing your movement…' : message}</Text>
        {!mode && <View style={styles.row}>
          <Pressable testID="live-start" accessibilityRole="button" disabled={pending} accessibilityState={{ disabled: pending }} onPress={() => void start('live')} style={styles.button}><Text style={styles.buttonText}>{pending ? 'Preparing…' : 'Start live coach'}</Text></Pressable>
          {__DEV__ && <Pressable testID="live-local-start" accessibilityRole="button" disabled={pending} onPress={() => void start('local')} style={styles.button}><Text style={styles.buttonText}>Test devices locally</Text></Pressable>}
          {__DEV__ && <Pressable testID="live-text-test-start" accessibilityRole="button" disabled={pending} onPress={() => void start('live', false)} style={styles.button}><Text style={styles.buttonText}>Test live requests with text</Text></Pressable>}
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
          viewPreference={session.avatarView}
          automaticView={plannedAvatarView(session.presentationPlan, session.sequence, activePlayback?.stepIndex ?? 0)}
          onPlaybackChange={recordPlayback} showLab={false} compact />
        {session.assessmentPlan?.checks.length ? <Text testID={practiceView.stage === 'performing' ? 'live-practice-active' : practiceView.stage === 'review' ? 'live-practice-review' : 'live-practice-waiting'} style={styles.note}>{practiceView.message}</Text> : null}
        <View testID={`live-form-${practiceView.startedAt === null ? 'demonstration' : 'practice'}`}>
          <Text testID={`live-review-${report?.status ?? 'none'}`} style={styles.status}>{report?.message ?? (practiceView.stage === 'performing' ? 'Recording quietly. Say “I’m done” for your review.' : 'No repetition review yet.')}</Text>
        </View>
        {session.sequence && <>
          <Text style={styles.note}>{activePlayback ? `Step ${activePlayback.stepIndex + 1} · ${activePlayback.phase} · ${activePlayback.status}` : 'Preparing demonstration…'}</Text>
          <View style={styles.row}>
            <Pressable testID={session.paused ? 'live-resume' : 'live-pause'} accessibilityRole="button" onPress={() => control(session.paused ? 'resume_movement' : 'pause_movement')} style={styles.button}><Text style={styles.buttonText}>{session.paused ? 'Resume movement' : 'Pause movement'}</Text></Pressable>
            <Pressable testID="live-clear" accessibilityRole="button" onPress={() => control('stop_movement')} style={styles.button}><Text style={styles.buttonText}>Clear movement</Text></Pressable>
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
        {turns.map((turn, index) => <View key={index} style={styles.panel}><Text style={styles.speaker}>{turn.role === 'user' ? 'You' : 'Guide'}</Text><Text selectable style={styles.note}>{conversationTranscript(turn.role, turn.text)}</Text></View>)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  connecting: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  callStatus: { position: 'absolute', top: 18, left: 20, right: 20, zIndex: 3, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 16, padding: 12 },
  callButtons: { position: 'absolute', right: 16, bottom: 28, zIndex: 4, flexDirection: 'row', gap: 8 },
  roundButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#303030', alignItems: 'center', justifyContent: 'center' },
  roundText: { color: '#fff', fontSize: 24, fontWeight: '600' },
  hiddenMarker: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  micIcon: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' },
  micCapsule: { position: 'absolute', top: 2, width: 9, height: 15, borderWidth: 1.6, borderColor: '#fff', borderRadius: 6 },
  micArc: { position: 'absolute', top: 9, width: 17, height: 12, borderWidth: 1.5, borderTopWidth: 0, borderColor: '#fff', borderBottomLeftRadius: 9, borderBottomRightRadius: 9 },
  micStem: { position: 'absolute', top: 21, width: 1.5, height: 4, backgroundColor: '#fff' },
  micSlash: { position: 'absolute', width: 27, height: 2, backgroundColor: '#fff', transform: [{ rotate: '-45deg' }] },

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
