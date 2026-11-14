import assert from 'node:assert/strict';
import test from 'node:test';
import { toPoseObservation } from '../src/vision/landmarks';
import { computeUpperBodyMetrics } from '../src/vision/metrics';
import { StatusStabilizer } from '../src/vision/stability';
import { evaluateGoalpostArms, GOALPOST_ARMS_CHECK_ID } from '../src/vision/checks/goalpostArms';
import type { PlaybackState } from '../src/shared/contracts';
/**
 * Vision seam tests.
 *
 * These fixtures are synthetic poses. They are not a supported exercise and they are not
 * registered in the application catalog. They exist to pin the geometry and the mapping
 * rules so the on-device spike cannot silently drift.
 */

/** BlazePose landmark indices, as published by MediaPipe. */
const INDEX = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
} as const;

type Point = { x: number; y: number; visibility?: number };

function frameFrom(points: Record<string, Point>, timestamp = 0) {
  const landmarks = new Float32Array(33 * 4);
  for (const [joint, point] of Object.entries(points)) {
    const offset = INDEX[joint as keyof typeof INDEX] * 4;
    landmarks[offset] = point.x;
    landmarks[offset + 1] = point.y;
    landmarks[offset + 2] = 0;
    landmarks[offset + 3] = point.visibility ?? 0.99;
  }
  return { landmarks, timestamp };
}

/** Shoulders 0.16 wide, elbows level with the shoulder line, wrists above them. */
const cleanGoalpost = {
  nose: { x: 0.5, y: 0.3 },
  leftEar: { x: 0.44, y: 0.34 },
  rightEar: { x: 0.56, y: 0.34 },
  leftShoulder: { x: 0.42, y: 0.5 },
  rightShoulder: { x: 0.58, y: 0.5 },
  leftElbow: { x: 0.34, y: 0.5 },
  rightElbow: { x: 0.66, y: 0.5 },
  leftWrist: { x: 0.34, y: 0.38 },
  rightWrist: { x: 0.66, y: 0.38 },
};

test('maps library landmarks into the shared PoseObservation contract', () => {
  const frame = frameFrom(cleanGoalpost, 987_654);

  const observation = toPoseObservation(frame, 1_712_345_678_901);

  assert.equal(observation.observedAt, 1_712_345_678_901);
  assert.equal(observation.mirrored, false);
  // The library stores landmarks in a Float32Array, so read values back with a float tolerance.
  assert.ok(Math.abs(observation.landmarks.left_shoulder.x - 0.42) < 1e-6);
  assert.ok(Math.abs(observation.landmarks.right_elbow.y - 0.5) < 1e-6);
  assert.ok(Math.abs(observation.landmarks.left_ear.visibility - 0.99) < 1e-6);
  assert.deepEqual(Object.keys(observation.landmarks).sort(), [
    'left_ear',
    'left_elbow',
    'left_shoulder',
    'left_wrist',
    'nose',
    'right_ear',
    'right_elbow',
    'right_shoulder',
    'right_wrist',
  ]);
});

const observe = (points: Record<string, Point>) => toPoseObservation(frameFrom(points), 1_000);

test('a goalpost hold measures level elbows and a wide spread', () => {
  const metrics = computeUpperBodyMetrics(observe(cleanGoalpost));

  assert.ok(metrics);
  assert.ok(Math.abs(metrics.elbowAboveShoulder) < 0.01);
  assert.ok(Math.abs(metrics.elbowSpread - 0.5) < 0.01);
});

test('dropped elbows measure below the shoulder line', () => {
  const dropped = {
    ...cleanGoalpost,
    leftElbow: { x: 0.34, y: 0.56 },
    rightElbow: { x: 0.66, y: 0.56 },
  };

  const metrics = computeUpperBodyMetrics(observe(dropped));

  assert.ok(metrics);
  assert.ok(Math.abs(metrics.elbowAboveShoulder + 0.375) < 0.01);
});

test('raised ears measure a smaller gap to the shoulders', () => {
  const shrugged = {
    ...cleanGoalpost,
    leftEar: { x: 0.44, y: 0.4 },
    rightEar: { x: 0.56, y: 0.4 },
  };

  const clean = computeUpperBodyMetrics(observe(cleanGoalpost));
  const raised = computeUpperBodyMetrics(observe(shrugged));

  assert.ok(clean && raised);
  assert.ok(Math.abs(clean.earToShoulder - 1) < 0.01);
  assert.ok(Math.abs(raised.earToShoulder - 0.625) < 0.01);
});

test('metrics are unchanged when the body is nearer the camera', () => {
  const nearer = {
    ...cleanGoalpost,
    leftShoulder: { x: 0.34, y: 0.5 },
    rightShoulder: { x: 0.66, y: 0.5 },
    leftElbow: { x: 0.18, y: 0.5 },
    rightElbow: { x: 0.82, y: 0.5 },
    leftEar: { x: 0.38, y: 0.18 },
    rightEar: { x: 0.62, y: 0.18 },
  };

  const metrics = computeUpperBodyMetrics(observe(nearer));

  assert.ok(metrics);
  assert.ok(Math.abs(metrics.elbowAboveShoulder) < 0.01);
  assert.ok(Math.abs(metrics.elbowSpread - 0.5) < 0.01);
});

test('metrics are unavailable without both shoulders', () => {
  const { leftShoulder: _omitted, ...noLeftShoulder } = cleanGoalpost;

  assert.equal(computeUpperBodyMetrics(observe(noLeftShoulder)), null);
});

test('a status becomes stable only after consecutive frames agree', () => {
  const stabilizer = new StatusStabilizer(4, 1_000);

  assert.equal(stabilizer.update('aligned', 1_000), null);
  assert.equal(stabilizer.update('aligned', 1_100), null);
  assert.equal(stabilizer.update('aligned', 1_200), null);
  assert.equal(stabilizer.update('aligned', 1_300), 'aligned');
});

test('a flickering status never becomes stable', () => {
  const stabilizer = new StatusStabilizer(3, 1_000);

  let now = 1_000;
  for (const status of ['aligned', 'needs_adjustment', 'aligned', 'needs_adjustment', 'aligned'] as const) {
    now += 100;
    assert.equal(stabilizer.update(status, now), null);
  }
});

test('a long gap drops the stable status', () => {
  const stabilizer = new StatusStabilizer(2, 500);

  assert.equal(stabilizer.update('aligned', 1_000), null);
  assert.equal(stabilizer.update('aligned', 1_100), 'aligned');
  // The camera paused or the frame handler stalled; the old status may not be reused.
  assert.equal(stabilizer.update('aligned', 2_000), null);
});

const playback: PlaybackState = {
  sequenceId: 'debug-session',
  stepIndex: 0,
  phase: 'moving',
  status: 'playing',
  updatedAt: 900,
};

test('a level goalpost hold reports aligned with its measurements', () => {
  const event = evaluateGoalpostArms(observe(cleanGoalpost), playback);

  assert.ok(event);
  assert.equal(event.status, 'aligned');
  assert.equal(event.checkId, GOALPOST_ARMS_CHECK_ID);
  assert.equal(event.sequenceId, 'debug-session');
  assert.equal(event.stepIndex, 0);
  assert.equal(event.observedAt, 1_000);
  assert.ok(Math.abs(event.measurements.elbowAboveShoulder) < 0.01);
  assert.ok(Math.abs(event.measurements.elbowSpread - 0.5) < 0.01);
});

test('dropped elbows report needs_adjustment', () => {
  const dropped = {
    ...cleanGoalpost,
    leftElbow: { x: 0.34, y: 0.56 },
    rightElbow: { x: 0.66, y: 0.56 },
  };

  assert.equal(evaluateGoalpostArms(observe(dropped), playback)?.status, 'needs_adjustment');
});

test('elbows tucked to the body report needs_adjustment', () => {
  const tucked = {
    ...cleanGoalpost,
    leftElbow: { x: 0.4, y: 0.5 },
    rightElbow: { x: 0.6, y: 0.5 },
  };

  assert.equal(evaluateGoalpostArms(observe(tucked), playback)?.status, 'needs_adjustment');
});

test('a joint the model cannot see reports not_observable, never aligned', () => {
  const hidden = {
    ...cleanGoalpost,
    leftElbow: { x: 0.34, y: 0.5, visibility: 0.1 },
  };

  const event = evaluateGoalpostArms(observe(hidden), playback);

  assert.ok(event);
  assert.equal(event.status, 'not_observable');
  assert.equal(event.measurements.missingLandmarks, 1);
});

test('the check stays silent outside the movement phase', () => {
  const observation = observe(cleanGoalpost);

  assert.equal(evaluateGoalpostArms(observation, { ...playback, phase: 'returning' }), null);
  assert.equal(evaluateGoalpostArms(observation, { ...playback, phase: 'preparing' }), null);
  assert.equal(evaluateGoalpostArms(observation, { ...playback, status: 'paused' }), null);
});
