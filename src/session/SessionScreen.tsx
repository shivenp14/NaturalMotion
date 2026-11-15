import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnatomyViewport } from '../anatomy/AnatomyViewport';
import { theme } from '../ui/theme';
import { useSession } from './SessionProvider';
import { VoiceDevPanel } from '../voice/VoiceDevPanel';
import { AgentDevPanel } from './AgentDevPanel';
import { router, usePathname } from 'expo-router';

export function SessionScreen() {
  const active = usePathname() === '/';
  const { phase, sequence, catalog, paused, playback, setPaused, recordPlayback, reset } = useSession();
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.wordmark}>NaturalMotion</Text>
          <Text style={styles.kicker}>MOVE WITH UNDERSTANDING</Text>
        </View>
        <View style={styles.intro}>
          <Text style={styles.title}>Make room{ '\n' }for movement.</Text>
          <Text style={styles.description}>Voice-guided movement, brought to life.</Text>
        </View>
        {__DEV__ && active && <AgentDevPanel />}
        {/* Reset the lab on session entry/exit so clearing a session cannot resume an old lab animation. */}
        {active && <AnatomyViewport sequence={sequence} paused={paused} onPlaybackChange={recordPlayback} />}
        {__DEV__ && sequence && <View style={styles.development}>
          <Text style={styles.devText}>Sequence: {sequence.id} · {playback ? `Group ${playback.stepIndex + 1} · ${playback.phase} · ${playback.status}` : 'Preparing'}</Text>
          <Pressable accessibilityRole="button" onPress={() => setPaused(!paused)} style={styles.button}>
            <Text style={styles.buttonText}>{paused ? 'Resume movement' : 'Pause movement'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={reset} style={styles.button}>
            <Text style={styles.buttonText}>Clear movement</Text>
          </Pressable>
        </View>}
        <View style={styles.status}>
          <View style={styles.dot} />
          <Text style={styles.description}>Your guide is getting ready</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/live')} style={styles.button}>
          <Text style={styles.buttonText}>Open live coach</Text>
        </Pressable>
        <Text style={styles.note}>Live coaching requires configured providers and a development build.</Text>
        {__DEV__ && active && (
          <View style={styles.development}>
            <Text style={styles.devTitle}>DEVELOPMENT WORKSPACE</Text>
            <Text style={styles.devText}>Session: {phase} · Registered components: {catalog.length}</Text>
            <Text style={styles.devText}>Validated agent sequences play on the anatomy model. Camera and supported pose checks are available in the live coach.</Text>
            <VoiceDevPanel />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: 24, gap: 24, maxWidth: 600, width: '100%', alignSelf: 'center' },
  header: { gap: 6 },
  wordmark: { color: theme.text, fontSize: 22, fontWeight: '600' },
  kicker: { color: theme.accent, fontSize: 10, letterSpacing: 2 },
  intro: { gap: 12, paddingTop: 12 },
  title: { color: theme.text, fontSize: 38, lineHeight: 44, fontWeight: '500' },
  description: { color: theme.muted, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.muted },
  button: { minHeight: 54, backgroundColor: theme.border, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: theme.muted, fontSize: 16, fontWeight: '500' },
  note: { color: theme.muted, textAlign: 'center', fontSize: 12, lineHeight: 18 },
  development: { gap: 8, borderTopWidth: 1, borderColor: theme.border, paddingTop: 20 },
  devTitle: { color: theme.accent, fontSize: 10, letterSpacing: 1.5 },
  devText: { color: theme.muted, fontSize: 12, lineHeight: 18 },
});
