import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { HttpAgentAdapter } from '../agent/httpAgent';
import { componentCatalog } from '../shared/catalog';
import { theme } from '../ui/theme';
import { useSession } from './SessionProvider';

/** Development-only text path for Issue #3. Does not imply native audio or animation works. */
export function AgentDevPanel() {
  const { sequence, acceptSequence, setPhase } = useSession();
  const [utterance, setUtterance] = useState('');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = Boolean(process.env.EXPO_PUBLIC_API_BASE_URL);

  async function submit() {
    if (!utterance.trim() || busy || !configured) return;
    setBusy(true);
    setPhase('thinking');
    try {
      const result = await new HttpAgentAdapter().respond({
        utterance: utterance.trim(), catalog: componentCatalog, currentSequence: sequence,
      });
      if (result.sequence !== undefined) {
        const accepted = acceptSequence(result.sequence);
        setResponse(accepted.ok ? result.speech : `Movement rejected: ${accepted.error}`);
        if (!accepted.ok) setPhase('idle');
      } else {
        setResponse(result.speech);
        setPhase('idle');
      }
    } catch (error) {
      setResponse(error instanceof Error ? error.message : 'Agent service error.');
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>AGENT TEXT PROTOTYPE — DEVELOPMENT ONLY</Text>
      <Text style={styles.hint}>Voice, camera, and model playback are not connected. The registered movement catalog is currently controlled by the team.</Text>
      <TextInput
        accessibilityLabel="Test agent request" value={utterance} onChangeText={setUtterance}
        placeholder="Describe a movement request" placeholderTextColor={theme.muted}
        style={styles.input} multiline
      />
      <Pressable
        accessibilityRole="button" disabled={!configured || busy || !utterance.trim()}
        accessibilityState={{ disabled: !configured || busy || !utterance.trim() }}
        onPress={() => { void submit(); }} style={styles.button}
      >
        <Text style={styles.buttonText}>{busy ? 'Processing…' : 'Test agent'}</Text>
      </Pressable>
      {!configured && <Text style={styles.hint}>Set EXPO_PUBLIC_API_BASE_URL to enable this test.</Text>}
      {Boolean(response) && <Text selectable style={styles.output}>{response}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12, paddingTop: 18, borderTopWidth: 1, borderColor: theme.border },
  label: { color: theme.accent, fontSize: 11, letterSpacing: 1.1 },
  hint: { color: theme.muted, fontSize: 12, lineHeight: 18 },
  input: { minHeight: 70, borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    color: theme.text, padding: 12, textAlignVertical: 'top' },
  button: { backgroundColor: theme.border, borderRadius: 12, padding: 14, alignItems: 'center' },
  buttonText: { color: theme.text, fontWeight: '600' },
  output: { color: theme.text, fontSize: 13, lineHeight: 20 },
});
