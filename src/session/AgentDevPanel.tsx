import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { HttpAgentAdapter } from '../agent/HttpAgentAdapter';
import { validateAgentReturn } from '../agent/validateAgentReturn';
import { cueCatalog } from '../shared/cues';
import { theme } from '../ui/theme';
import { useSession } from './SessionProvider';

/** Text isolates live planning/playback from native microphone and speaker acceptance. */
export function AgentDevPanel() {
  const session = useSession();
  const latest = useRef(session);
  useEffect(() => { latest.current = session; }, [session]);
  const pending = useRef<AbortController | null>(null);
  const backendUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  const [utterance, setUtterance] = useState('Demonstrate a wall angel using the supported upper-body components.');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Text requests use the live backend. No speech or camera input.');
  const [payload, setPayload] = useState('');
  const [showPayload, setShowPayload] = useState(false);

  useEffect(() => {
    const cancel = () => {
      pending.current?.abort(); pending.current = null; setBusy(false);
    };
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    return () => { listener.remove(); pending.current?.abort(); pending.current = null; };
  }, []);

  async function send() {
    if (!backendUrl || pending.current || !utterance.trim()) return;
    const request = new AbortController();
    pending.current = request;
    setBusy(true); setPayload(''); setMessage('Requesting movement instructions…');
    const context = latest.current;
    try {
      const adapter = new HttpAgentAdapter({ baseUrl: backendUrl, compositionPolicy: context.compositionPolicy });
      const response = await adapter.respond({ utterance, catalog: context.catalog, cues: cueCatalog,
        currentSequence: context.sequence }, request.signal);
      if (request.signal.aborted) return;
      const checked = validateAgentReturn(response, { catalog: context.catalog, cues: cueCatalog,
        currentSequence: context.sequence, compositionPolicy: context.compositionPolicy });
      if (!checked.ok) throw new Error(checked.error);
      // Check the whole batch before changing session state.
      if (checked.value.actions.some(action => action.type === 'modify_playback' || action.type === 'replay_demonstration')) {
        throw new Error('Indexed playback controls are not connected. Request a complete replacement sequence.');
      }
      if (latest.current.sequence !== context.sequence) throw new Error('Session changed while planning. Send the request again.');
      const notes: string[] = [];
      for (const action of checked.value.actions) {
        switch (action.type) {
          case 'play_sequence': {
            const result = latest.current.acceptSequence(action.sequence);
            if (!result.ok) throw new Error(result.error);
            notes.push(`Validated sequence · ${action.sequence.steps.length} groups`);
            break;
          }
          case 'speak_text': notes.push(action.text); break;
          case 'speak_cue': notes.push(cueCatalog[action.cueId]); break;
          case 'pause_session': latest.current.setPaused(true); notes.push('Movement paused.'); break;
          case 'stop_session': latest.current.reset(); notes.push('Movement stopped.'); break;
          case 'no_action': notes.push('No movement requested.'); break;
        }
      }
      setPayload(JSON.stringify(checked.value, null, 2));
      setMessage(notes.join('\n'));
    } catch (error) {
      if (!request.signal.aborted) setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (pending.current === request) { pending.current = null; setBusy(false); }
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>AGENT → MOVEMENT TEST · DEVELOPMENT ONLY</Text>
      <Text style={styles.note}>Six verified animation components. Camera checks are not connected. Use text and voice tests separately.</Text>
      {!backendUrl && <Text style={styles.note}>Set EXPO_PUBLIC_API_BASE_URL to enable live requests.</Text>}
      <TextInput accessibilityLabel="Movement request" value={utterance} onChangeText={setUtterance}
        multiline editable={!busy} style={styles.input} placeholderTextColor={theme.muted} />
      <Pressable accessibilityRole="button" disabled={!backendUrl || busy || !utterance.trim()}
        accessibilityState={{ disabled: !backendUrl || busy || !utterance.trim() }}
        onPress={() => void send()} style={styles.button}>
        <Text style={styles.label}>{busy ? 'Generating…' : 'Send movement request'}</Text>
      </Pressable>
      <Text style={styles.note} accessibilityLiveRegion="polite">{message}</Text>
      {!!payload && <>
        <Pressable accessibilityRole="button" onPress={() => setShowPayload(value => !value)} style={styles.button}>
          <Text style={styles.label}>{showPayload ? 'Hide' : 'Show'} validated instructions</Text>
        </Pressable>
        {showPayload && <Text selectable style={styles.json}>{payload}</Text>}
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12, padding: 16, borderWidth: 1, borderColor: theme.border, borderRadius: 16 },
  label: { fontSize: 12, fontWeight: '600', color: theme.accent },
  note: { fontSize: 12, lineHeight: 18, color: theme.muted },
  input: { minHeight: 80, color: theme.text, backgroundColor: theme.surface, borderRadius: 12, padding: 12, textAlignVertical: 'top' },
  button: { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: theme.border, justifyContent: 'center' },
  json: { fontFamily: 'monospace', fontSize: 11, lineHeight: 16, color: theme.text },
});
