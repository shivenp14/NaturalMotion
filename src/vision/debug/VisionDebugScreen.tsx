import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import { theme } from '../../ui/theme';
import type { FormEvent, PlaybackState, PoseObservation } from '../../shared/contracts';
import { CameraPoseView } from '../CameraPoseView';
import { toPoseObservation, isFreshFrame, type PoseFrameLike } from '../landmarks';
import { StatusStabilizer, type FormStatus } from '../stability';
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
  stableStatus: FormStatus | null;
};

const format = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(3);

export function VisionDebugScreen() {
  const focused = useIsFocused();
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
  const [cameraFrameCount, setCameraFrameCount] = useState(0);
  const [cameraGeneration, setCameraGeneration] = useState(0);
  const [trackingLost, setTrackingLost] = useState(false);
  const lastFrameTimestamp = useRef<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      if (stabilizer.current.expire(Date.now())) {
        setSnapshot(null);
        setTrackingLost(true);
      }
    }, 200);
    return () => clearInterval(timer);
  }, []);

  function handleFrame(frame: PoseFrameLike) {
    // A buffered result delivered after a stall carries the timestamp it already had. Rejecting it
    // keeps a stale observation from refreshing the stabilizer or delaying tracking loss.
    if (!isFreshFrame(lastFrameTimestamp.current, frame.timestamp)) return;
    if (frame.timestamp !== undefined) lastFrameTimestamp.current = frame.timestamp;

    const now = Date.now();
    if (playback.current.updatedAt === 0) {
      playback.current = { ...playback.current, updatedAt: now };
    }
    const observation = toPoseObservation(frame, now);
    const event = evaluateGoalpostArms(observation, playback.current);
    setFrameCount((count) => count + 1);
    if (!event) return;

    const stableStatus = stabilizer.current.update(event.status, event.observedAt);
    setTrackingLost(false);
    setSnapshot({ observation, event, stableStatus });
  }

  function reset() {
    stabilizer.current.reset();
    lastFrameTimestamp.current = null;
    setSnapshot(null);
    setFrameCount(0);
    setCameraFrameCount(0);
    setTrackingLost(false);
    setReady(null);
    setFps(null);
    setError(null);
    playback.current = { ...playback.current, updatedAt: 0 };
    // Remount the native camera too: clearing UI counters does not reset a bad tracker.
    setCameraGeneration((generation) => generation + 1);
  }

  const measurements = snapshot?.event.measurements;

  // The route ships in every build; keep the diagnostic screen out of release and preview APKs.
  if (!__DEV__) return null;

  return (
    <SafeAreaView style={styles.screen} testID="vision-debug-screen">
      <View style={styles.camera}>
        <CameraPoseView
          key={cameraGeneration}
          active={focused}
          onFrame={handleFrame}
          onReady={setReady}
          onPerformance={setFps}
          onError={setError}
          onCameraImage={() => setCameraFrameCount(count => count + 1)}
        />
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <View style={styles.row}>
          <Text style={styles.eyebrow}>VISION DEBUG · NOT A SESSION</Text>
          <Pressable testID="vision-restart" accessibilityRole="button" onPress={reset}>
            <Text style={styles.reset}>Restart camera</Text>
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor(snapshot?.stableStatus ?? null) }]} />
          <Text style={styles.status}>
            {trackingLost ? 'tracking lost · reposition in view' : statusLabel(snapshot?.stableStatus ?? null)}
          </Text>
        </View>

        <Text style={styles.muted}>
          {ready
            ? `${ready.delegate} · target ${ready.targetFps} fps · ${ready.deviceTier} tier`
            : 'Waiting for the camera'}
          {fps !== null ? ` · measured ${fps.toFixed(0)} fps` : ''}
          {` · ${frameCount} frames`}
        </Text>

        <Text style={styles.muted} testID={`vision-camera-${cameraFrameCount > 0 ? 'arrived' : 'pending'}-${cameraGeneration}`}>
          {`Local camera samples: ${cameraFrameCount}`}
        </Text>
        <Text style={styles.muted} testID="vision-pose-status">{`Pose frames: ${frameCount}`}</Text>
        {frameCount > 0 && <Text style={styles.muted} testID="vision-pose-arrived">Pose landmarks received.</Text>}

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.muted}>
          Keep your head, shoulders, elbows and hips in view. Face the camera with light in front
          of you; avoid a bright window or ceiling light behind your head.
        </Text>

        <Text style={styles.section}>MEASUREMENTS (shoulder widths)</Text>
        <MetricRow label="elbow above shoulder" value={measurements?.elbowAboveShoulder} />
        <MetricRow label="elbow spread" value={measurements?.elbowSpread} />
        <MetricRow label="ear to shoulder" value={measurements?.earToShoulder} />
        <Text style={styles.muted}>
          {`Thresholds: elbow ≥ ${DEFAULT_GOALPOST_THRESHOLDS.minimumElbowAboveShoulder}, ` +
            `spread ≥ ${DEFAULT_GOALPOST_THRESHOLDS.minimumElbowSpread}`}
        </Text>

        <Text style={styles.section}>RAW RESULT</Text>
        <Text style={styles.muted}>
          {snapshot
            ? `raw ${snapshot.event.status} → stable ${snapshot.stableStatus ?? 'pending'}` +
              ` · missing ${measurements?.missingLandmarks ?? 0}`
            : 'No frame yet'}
        </Text>

        <Text style={styles.section}>ORIENTATION AND TIME</Text>
        <Text style={styles.muted}>
          {snapshot
            ? `mirrored=${String(snapshot.observation.mirrored)} · observed ${
                new Date(snapshot.observation.observedAt).toISOString()
              }`
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

function statusColor(status: FormStatus | null) {
  if (status === 'aligned') return theme.accent;
  if (status === 'needs_adjustment') return '#e9c9a8';
  if (status === 'not_observable') return '#e9a8a8';
  return theme.border;
}

function statusLabel(status: FormStatus | null) {
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
