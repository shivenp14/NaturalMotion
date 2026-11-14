import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PoseFrame } from 'react-native-pose-detection';
import { theme } from '../../ui/theme';
import type { FormEvent, PlaybackState, PoseObservation } from '../../shared/contracts';
import { CameraPoseView } from '../CameraPoseView';
import { toPoseObservation } from '../landmarks';
import { computeUpperBodyMetrics, unobservableJoints, type UpperBodyMetrics } from '../metrics';
import { StatusStabilizer } from '../stability';
import { DEFAULT_GOALPOST_THRESHOLDS, evaluateGoalpostArms } from '../checks/goalpostArms';

/**
 * Temporary debug view for the camera checkpoint (issue #1).
 *
 * Deliberately outside the app flow: no catalog entry, no sequence, no session state. The playback
 * object below is a fixed local stand-in so the evaluator can gate on a phase without pretending
 * that a movement is registered.
 */

type Snapshot = {
  observation: PoseObservation;
  event: FormEvent;
  metrics: UpperBodyMetrics | null;
  stableStatus: string | null;
};

const format = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(3);

export function VisionDebugScreen() {
  const stabilizer = useRef(new StatusStabilizer(4, 1_000));
  const playback = useRef<PlaybackState>({
    sequenceId: 'vision-debug',
    stepIndex: 0,
    phase: 'moving',
    status: 'playing',
    // Stamped when the first frame arrives. A scoring read during render would be impure.
    updatedAt: 0,
  });

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState<{ delegate: string; targetFps: number; deviceTier: string } | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);

  function handleFrame(frame: PoseFrame) {
    const now = Date.now();
    if (playback.current.updatedAt === 0) {
      playback.current = { ...playback.current, updatedAt: now };
    }
    const observation = toPoseObservation(frame, now);
    const event = evaluateGoalpostArms(observation, playback.current);
    setFrameCount((count) => count + 1);
    if (!event) return;

    const stableStatus = stabilizer.current.update(event.status, event.observedAt);
    setSnapshot({
      observation,
      event,
      metrics: computeUpperBodyMetrics(observation),
      stableStatus,
    });
  }

  function reset() {
    stabilizer.current.reset();
    setSnapshot(null);
    setFrameCount(0);
  }

  const missing = snapshot ? unobservableJoints(snapshot.observation) : [];

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.camera}>
        <CameraPoseView
          onFrame={handleFrame}
          onReady={setReady}
          onPerformance={setFps}
          onError={setError}
        />
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <View style={styles.row}>
          <Text style={styles.eyebrow}>VISION DEBUG · NOT A SESSION</Text>
          <Pressable accessibilityRole="button" onPress={reset}>
            <Text style={styles.reset}>Reset</Text>
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor(snapshot?.stableStatus ?? null) }]} />
          <Text style={styles.status}>{statusLabel(snapshot?.stableStatus ?? null)}</Text>
        </View>

        <Text style={styles.muted}>
          {ready
            ? `${ready.delegate} · target ${ready.targetFps} fps · ${ready.deviceTier} tier`
            : 'Waiting for the camera'}
          {fps !== null ? ` · measured ${fps.toFixed(0)} fps` : ''}
          {` · ${frameCount} frames`}
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.section}>MEASUREMENTS (shoulder widths)</Text>
        <MetricRow label="elbow above shoulder" value={snapshot?.metrics?.elbowAboveShoulder} />
        <MetricRow label="elbow spread" value={snapshot?.metrics?.elbowSpread} />
        <MetricRow label="ear to shoulder" value={snapshot?.metrics?.earToShoulder} />
        <Text style={styles.muted}>
          {`Thresholds: elbow ≥ ${DEFAULT_GOALPOST_THRESHOLDS.minimumElbowAboveShoulder}, ` +
            `spread ≥ ${DEFAULT_GOALPOST_THRESHOLDS.minimumElbowSpread}`}
        </Text>

        <Text style={styles.section}>RAW RESULT</Text>
        <Text style={styles.muted}>
          {snapshot
            ? `raw ${snapshot.event.status} → stable ${snapshot.stableStatus ?? 'pending'}` +
              ` · missing ${missing.length === 0 ? 'none' : missing.join(', ')}`
            : 'No frame yet'}
        </Text>

        <Text style={styles.section}>LANDMARKS</Text>
        {snapshot ? (
          Object.entries(snapshot.observation.landmarks).map(([name, landmark]) => (
            <View key={name} style={styles.landmarkRow}>
              <Text style={styles.landmarkName}>{name}</Text>
              <Text style={styles.landmarkValue}>
                {`${landmark.x.toFixed(3)}  ${landmark.y.toFixed(3)}  ${landmark.visibility.toFixed(2)}`}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Stand in front of the camera.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricRow({ label, value }: { label: string; value: number | undefined }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{format(value)}</Text>
    </View>
  );
}

function statusColor(status: string | null) {
  if (status === 'aligned') return theme.accent;
  if (status === 'needs_adjustment') return '#e9c9a8';
  if (status === 'not_observable') return '#e9a8a8';
  return theme.border;
}

function statusLabel(status: string | null) {
  if (status === 'aligned') return 'aligned';
  if (status === 'needs_adjustment') return 'needs adjustment';
  if (status === 'not_observable') return 'not observable';
  return 'waiting for a steady reading';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  camera: { flex: 1, minHeight: 280, backgroundColor: '#000' },
  panel: { maxHeight: '52%', backgroundColor: theme.surface },
  panelContent: { padding: 20, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: theme.accent, fontSize: 10, letterSpacing: 1.6, fontWeight: '600' },
  reset: { color: theme.muted, fontSize: 13 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { color: theme.text, fontSize: 18, fontWeight: '500' },
  section: { color: theme.accent, fontSize: 10, letterSpacing: 1.4, marginTop: 10 },
  muted: { color: theme.muted, fontSize: 12, lineHeight: 18 },
  error: { color: '#e9a8a8', fontSize: 12, lineHeight: 18 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metricLabel: { color: theme.muted, fontSize: 13 },
  metricValue: { color: theme.text, fontSize: 13, fontVariant: ['tabular-nums'] },
  landmarkRow: { flexDirection: 'row', justifyContent: 'space-between' },
  landmarkName: { color: theme.muted, fontSize: 11 },
  landmarkValue: { color: theme.text, fontSize: 11, fontVariant: ['tabular-nums'] },
});
