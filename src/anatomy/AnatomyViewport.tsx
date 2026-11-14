import { StyleSheet, Text, View } from 'react-native';
import type { MovementSequence, PlaybackState } from '../shared/contracts';
import { theme } from '../ui/theme';

export type AnatomyViewportProps = {
  sequence: MovementSequence | null;
  onPlaybackChange?: (state: PlaybackState) => void;
};

/** Person 2: replace this empty state with the single rigged anatomy renderer. */
export function AnatomyViewport({ sequence }: AnatomyViewportProps) {
  return (
    <View style={styles.viewport} accessibilityLabel="Anatomical movement preview; model not connected">
      <Text style={styles.eyebrow}>MOVEMENT GUIDE</Text>
      <View style={styles.center}>
        <Text style={styles.title}>A movement, made visible.</Text>
        <Text style={styles.caption}>
          {sequence ? 'Your movement preview is being prepared.' : 'Your anatomical guide will appear here.'}
        </Text>
      </View>
      <Text style={styles.caption}>Expected muscle involvement · educational visualization</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { minHeight: 310, backgroundColor: theme.surface, borderRadius: 24, padding: 24, justifyContent: 'space-between' },
  center: { gap: 12, paddingVertical: 30 },
  eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '600', letterSpacing: 2 },
  title: { color: theme.text, fontSize: 30, fontWeight: '500', maxWidth: 260 },
  caption: { color: theme.muted, fontSize: 13, lineHeight: 20 },
});
