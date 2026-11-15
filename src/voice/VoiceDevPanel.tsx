import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionPhase } from '../shared/contracts';
import { theme } from '../ui/theme';
import { TurnCoordinator } from './turnCoordinator';
import { HttpAgentAdapter } from '../agent/HttpAgentAdapter';
import { cueCatalog } from '../shared/cues';
import { useSession } from '../session/SessionProvider';

/** Development voice panel; conversations remain in memory for the current session. */
export function VoiceDevPanel() {
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const backendUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  const controller = useRef<TurnCoordinator | null>(null);
  const stopping = useRef<Promise<void>>(Promise.resolve());
  const shutdownPending = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [pending, setPending] = useState(false);
  const [turns, setTurns] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [message, setMessage] = useState('Ready to test microphone and speech output.');
  const supported = Platform.OS === 'android';

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') void stop();
    });
    return () => {
      mounted.current = false;
      epoch.current = epoch.current + 1;
      subscription.remove();
      const current = controller.current;
      controller.current = null;
      if (current) void current.stop().catch(() => {});
    };
  }, []);

  async function start(mode: 'echo' | 'agent') {
    if (controller.current || shutdownPending.current || pending || !supported) return;
    const run = ++epoch.current;
    setPending(true);
    setMessage('Requesting microphone permission…');
    setTurns([]);
    try {
      // Defer native module loading so Expo Go can still display the application shell.
      const { createExpoVoiceAdapter } = await import('./expoVoice');
      if (!mounted.current || run !== epoch.current) return;
      const current = new TurnCoordinator({
        voice: createExpoVoiceAdapter(),
        agent: mode === 'agent'
          ? new HttpAgentAdapter({ baseUrl: backendUrl!, compositionPolicy: sessionRef.current.compositionPolicy })
          : { respond: async ({ utterance }) => {
          return { decisionId: 'echo', trigger: { type: 'user_utterance', id: 'echo-utterance' },
            actions: [{ type: 'speak_text', text: `I heard: ${utterance}. Voice test complete.` }] };
        } },
        compositionPolicy: sessionRef.current.compositionPolicy,
        getContext: () => ({ catalog: sessionRef.current.catalog, cues: cueCatalog,
          currentSequence: sessionRef.current.sequence }),
        onSequence: sequence => {
          const checked = sessionRef.current.acceptSequence(sequence);
          if (!checked.ok) throw new Error(checked.error);
        },
        onPlaybackAction: action => {
          if (action.type === 'stop_session') sessionRef.current.reset();
          else if (action.type === 'pause_session') sessionRef.current.setPaused(true);
          else throw new Error('Indexed playback controls are not connected. Request a complete replacement sequence.');
        },
        supportedPlaybackActions: ['pause_session', 'stop_session'],
        onStopped: () => { if (controller.current === current) controller.current = null; },
        onTranscript: text => {
          if (mounted.current && run === epoch.current) setTurns(previous => [...previous, { role: 'user' as const, text }].slice(-40));
        },
        onSpokenText: text => {
          if (mounted.current && run === epoch.current) setTurns(previous => [...previous, { role: 'assistant' as const, text }].slice(-40));
        },
        onPhase: next => { if (mounted.current && run === epoch.current) setPhase(next); },
        onError: error => {
          if (mounted.current && run === epoch.current) {
            setMessage(error instanceof Error ? error.message : String(error));
            controller.current = null;
          }
        },
      });
      controller.current = current;
      await current.start();
      if (mounted.current && run === epoch.current && controller.current === current) {
        setMessage('Speak from your planned movement distance.');
      }
    } catch (error) {
      if (mounted.current && run === epoch.current) {
        controller.current = null;
        setMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (mounted.current && run === epoch.current) setPending(false);
    }
  }

  async function stop() {
    const run = ++epoch.current;
    const current = controller.current;
    controller.current = null;
    if (current) {
      shutdownPending.current = true;
      stopping.current = current.stop();
    }
    if (mounted.current) setPending(true);
    try {
      await stopping.current;
      if (mounted.current && run === epoch.current) setMessage('Voice test stopped.');
    } catch (error) {
      if (mounted.current && run === epoch.current) setMessage(String(error));
    } finally {
      shutdownPending.current = false;
      if (mounted.current && run === epoch.current) { setPhase('idle'); setPending(false); }
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>VOICE TEST · DEVELOPMENT ONLY</Text>
      <Text style={styles.note}>Echo stays local to the app. Agent mode sends your transcript to the configured backend. Your device’s speech service may process audio online.</Text>
      <Text style={styles.note}>{supported ? message : 'Requires an Android development build with speech modules.'}</Text>
      {!backendUrl && <Text style={styles.note}>Configure EXPO_PUBLIC_API_BASE_URL to enable agent mode.</Text>}
      <Text style={styles.note}>Status: {phase}</Text>
      <View style={styles.conversation} accessibilityLabel="Voice test conversation">
        <Text style={styles.title}>CONVERSATION</Text>
        {turns.length === 0 ? <Text style={styles.note}>Your conversation will appear here.</Text> :
          turns.map((turn, index) => (
            <View key={index} style={styles.turn}>
              <Text style={styles.speaker}>{turn.role === 'user' ? 'You' : 'Guide'}</Text>
              <Text style={styles.conversationText} selectable>{turn.text}</Text>
            </View>
          ))}
      </View>
      <View style={styles.buttons}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !supported || pending || phase !== 'idle' }}
          disabled={!supported || pending || phase !== 'idle'} onPress={() => void start('echo')} style={styles.button}>
          <Text style={styles.title}>Start echo test</Text>
        </Pressable>
        <Pressable accessibilityRole="button"
          accessibilityState={{ disabled: !supported || !backendUrl || pending || phase !== 'idle' }}
          disabled={!supported || !backendUrl || pending || phase !== 'idle'}
          onPress={() => void start('agent')} style={styles.button}>
          <Text style={styles.title}>Start agent test</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void stop()} style={styles.button}>
          <Text style={styles.title}>Stop</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10, borderTopColor: theme.border, borderTopWidth: 1, paddingTop: 16 },
  title: { fontSize: 12, fontWeight: '600', color: theme.accent },
  note: { fontSize: 12, lineHeight: 18, color: theme.muted },
  conversation: { gap: 12, padding: 14, backgroundColor: theme.surface, borderRadius: 14 },
  turn: { gap: 3 },
  speaker: { color: theme.accent, fontSize: 12, fontWeight: '600' },
  conversationText: { color: theme.text, fontSize: 14, lineHeight: 20 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { backgroundColor: theme.border, borderRadius: 14, padding: 14, minHeight: 48, justifyContent: 'center' },
});
