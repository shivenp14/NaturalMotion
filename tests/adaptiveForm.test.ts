import assert from 'node:assert/strict';
import test from 'node:test';
import { MathUtils, Quaternion, Vector3 } from 'three';
import { createWallAngelReference, compileUpperBodySequence } from '../src/anatomy/upperBodySequence';
import { wallAngelDefaults } from '../src/anatomy/wallAngel';
import { initialUpperBodyPose, type ArmPose, type UpperBodyPose } from '../src/anatomy/upperBodyPose';
import type { PlaybackState, PoseObservation } from '../src/shared/contracts';
import { ASSESSMENT_METRICS, type AssessmentMetric, type BodySide } from '../src/shared/assessment';
import { assessMeasurements, angularError, measureAssessment } from '../src/vision/assessmentGeometry';
import { buildAssessmentPlan, currentAssessmentChecks, readinessChecks, targetForArm, validateAssessmentPlan } from '../src/vision/assessmentPlan';
import { evaluateAdaptiveForm } from '../src/vision/adaptiveForm';
import { AutomaticPracticeDetector } from '../src/vision/automaticPractice';
import { PracticeSession } from '../src/vision/practiceSession';

const sequence = createWallAngelReference(wallAngelDefaults, 'adaptive-test');
const selections = sequence.steps.flatMap((_, stepIndex) => (['left', 'right'] as const).flatMap(side =>
  ASSESSMENT_METRICS.map(metric => ({ stepIndex, side, metric, toleranceDeg: 15 }))));
const plan = buildAssessmentPlan(sequence, selections);
const completed: PlaybackState = { sequenceId: sequence.id, stepIndex: sequence.steps.length - 1,
  phase: 'completed', status: 'completed', updatedAt: 1000 };

// Independent Three quaternion construction mirrors the renderer's authored
// vectors, then reflects x into the camera subject's left/right convention.
function armVectors(arm: ArmPose, side: BodySide) {
  const sign = side === 'left' ? 1 : -1;
  const e = MathUtils.degToRad(arm.elevationDeg), f = MathUtils.degToRad(arm.elbowFlexionDeg);
  const upper = new Vector3(sign * Math.sin(e), -Math.cos(e), -0.22).normalize();
  const forearm = new Vector3(sign * Math.sin(e + f), -Math.cos(e + f), 0)
    .applyQuaternion(new Quaternion().setFromAxisAngle(upper, sign * MathUtils.degToRad(arm.externalRotationDeg - 90)));
  return { upper, forearm };
}

function expectedMetric(arm: ArmPose, side: BodySide, metric: AssessmentMetric) {
  const { upper, forearm } = armVectors(arm, side);
  if (metric === 'upper_arm_elevation') return MathUtils.radToDeg(upper.angleTo(new Vector3(0, -1, 0)));
  if (metric === 'elbow_bend') return MathUtils.radToDeg(upper.angleTo(forearm));
  return MathUtils.radToDeg(Math.atan2((side === 'left' ? 1 : -1) * forearm.x, forearm.y));
}

function observation(time: number, pose: UpperBodyPose = initialUpperBodyPose()): PoseObservation {
  const landmarks: PoseObservation['landmarks'] = {};
  const worldLandmarks: NonNullable<PoseObservation['worldLandmarks']> = {};
  const put = (name: string, point: Vector3) => {
    worldLandmarks[name] = { x: point.x, y: point.y, z: point.z };
    landmarks[name] = { x: 0.5 + point.x * 0.5, y: 0.8 - point.y * 0.5, visibility: 1 };
  };
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? -1 : 1;
    const shoulder = new Vector3(sign * 0.2, 1, 0);
    const { upper, forearm } = armVectors(pose[side], side);
    upper.x *= -1; forearm.x *= -1;
    const elbow = shoulder.clone().addScaledVector(upper, 0.3);
    const wrist = elbow.clone().addScaledVector(forearm, 0.3);
    put(`${side}_shoulder`, shoulder); put(`${side}_elbow`, elbow); put(`${side}_wrist`, wrist);
    put(`${side}_hip`, new Vector3(sign * 0.17, 0, 0));
  }
  return { observedAt: time, mirrored: false, landmarks, worldLandmarks };
}

test('assessment targets match independent renderer quaternion geometry, including axial rotation', () => {
  for (const side of ['left', 'right'] as const) for (const arm of [
    { elevationDeg: 90, elbowFlexionDeg: 90, externalRotationDeg: 80 },
    { elevationDeg: 120, elbowFlexionDeg: 50, externalRotationDeg: 90 },
    { elevationDeg: 150, elbowFlexionDeg: 20, externalRotationDeg: 100 },
  ]) for (const metric of ASSESSMENT_METRICS) {
    assert.ok(Math.abs(angularError(targetForArm(arm, side, metric), expectedMetric(arm, side, metric))) < 1e-8);
  }
});

test('matching elbows cannot conceal an inverted forearm from the direction check', () => {
  const good = observation(2000);
  const wrong = structuredClone(good);
  const elbow = wrong.worldLandmarks!.left_elbow;
  const wrist = wrong.worldLandmarks!.left_wrist;
  wrist.x = 2 * elbow.x - wrist.x; wrist.y = 2 * elbow.y - wrist.y; wrist.z = 2 * elbow.z - wrist.z;
  const ready = readinessChecks(sequence).filter(check => check.side === 'left');
  const measured = Object.fromEntries(ready.map(check => [`${check.side}_${check.metric}`, measureAssessment(wrong, check.side, check.metric)]));
  assert.ok(Math.abs(measured.left_upper_arm_elevation! - targetForArm(initialUpperBodyPose().left, 'left', 'upper_arm_elevation')) < 1e-8);
  assert.ok(Math.abs(measured.left_elbow_bend! - 90) < 1e-8);
  const result = assessMeasurements(ready, measured);
  assert.equal(result.status, 'needs_adjustment'); assert.equal(result.checkId, 'left_forearm_direction');
  assert.match(result.message, /left forearm/);
});

test('world geometry drives metrics independently of image aspect and unused landmarks', () => {
  const pose = initialUpperBodyPose();
  pose.left = { elevationDeg: 135, elbowFlexionDeg: 40, externalRotationDeg: 100 };
  const sample = observation(2000, pose);
  for (const side of ['left', 'right'] as const) for (const metric of ASSESSMENT_METRICS) {
    assert.ok(Math.abs(angularError(measureAssessment(sample, side, metric)!, expectedMetric(pose[side], side, metric))) < 1e-8);
  }
  for (const point of Object.values(sample.landmarks)) point.y *= 0.25;
  for (const metric of ASSESSMENT_METRICS) {
    assert.ok(Math.abs(angularError(measureAssessment(sample, 'left', metric)!, expectedMetric(pose.left, 'left', metric))) < 1e-8);
  }
});

test('body-relative measurements support MediaPipe downward world-y coordinates', () => {
  const sample = observation(2000);
  const before = ASSESSMENT_METRICS.map(metric => measureAssessment(sample, 'left', metric));
  for (const point of Object.values(sample.worldLandmarks!)) point.y *= -1;
  const after = ASSESSMENT_METRICS.map(metric => measureAssessment(sample, 'left', metric));
  after.forEach((value, index) => assert.ok(Math.abs(angularError(value!, before[index]!)) < 1e-8));
});

test('missing world points, low confidence, mirrored input and unsuitable view never become aligned', () => {
  const checks = readinessChecks(sequence);
  for (const alter of [
    (sample: PoseObservation) => { delete sample.worldLandmarks; },
    (sample: PoseObservation) => { sample.landmarks.left_wrist.visibility = 0.64; },
    (sample: PoseObservation) => { sample.landmarks.left_wrist.x = NaN; },
    (sample: PoseObservation) => { sample.landmarks.left_wrist.y = 1.1; },
    (sample: PoseObservation) => { sample.worldLandmarks!.left_wrist.z = NaN; },
    (sample: PoseObservation) => { sample.mirrored = true; },
    (sample: PoseObservation) => { sample.worldLandmarks!.right_shoulder.z = 1; },
    (sample: PoseObservation) => { sample.landmarks.right_shoulder.x = sample.landmarks.left_shoulder.x + 0.01; },
  ]) {
    const sample = observation(2000); alter(sample);
    const measurements = Object.fromEntries(checks.map(check => [`${check.side}_${check.metric}`, measureAssessment(sample, check.side, check.metric)]));
    assert.equal(assessMeasurements(checks, measurements).status, 'not_observable');
  }
  const wristHidden = observation(2000); delete wristHidden.worldLandmarks!.left_wrist;
  assert.notEqual(measureAssessment(wristHidden, 'left', 'upper_arm_elevation'), null);
  assert.equal(measureAssessment(wristHidden, 'left', 'forearm_direction'), null);
  assert.equal(assessMeasurements([], {}).status, 'unavailable');
});

test('assessment validation rejects unsupported, duplicate, mismatched and forged targets', () => {
  assert.deepEqual(validateAssessmentPlan(plan, sequence), plan);
  assert.equal(validateAssessmentPlan(null, sequence), null);
  for (const invalid of [
    [{ ...selections[0], metric: 'wall_contact' }], [{ ...selections[0], toleranceDeg: 26 }],
    [{ ...selections[0], stepIndex: sequence.steps.length }], [selections[0], selections[0]],
    [{ ...selections[0], targetDeg: 30 }],
  ]) assert.throws(() => buildAssessmentPlan(sequence, invalid));
  assert.throws(() => validateAssessmentPlan({ ...plan, sequenceId: 'other' }, sequence));
  for (const targetDeg of [plan.checks[0].targetDeg + 1, NaN, Infinity]) {
    assert.throws(() => validateAssessmentPlan({ ...plan, checks: [{ ...plan.checks[0], targetDeg }] }, sequence));
  }
});

test('moving targets interpolate with renderer easing and pause/preparation retain no active assessment', () => {
  const segment = compileUpperBodySequence(sequence).segments[0];
  const state: PlaybackState = { ...completed, stepIndex: 0, phase: 'moving', status: 'playing', updatedAt: 1000 };
  const elapsed = segment.durationSeconds * 250;
  const checks = currentAssessmentChecks(plan, sequence, state, 1000 + elapsed);
  const ease = 0.25 * 0.25 * (3 - 2 * 0.25);
  const arm: ArmPose = { elevationDeg: segment.from.left.elevationDeg + (segment.to.left.elevationDeg - segment.from.left.elevationDeg) * ease,
    elbowFlexionDeg: segment.from.left.elbowFlexionDeg + (segment.to.left.elbowFlexionDeg - segment.from.left.elbowFlexionDeg) * ease,
    externalRotationDeg: segment.from.left.externalRotationDeg + (segment.to.left.externalRotationDeg - segment.from.left.externalRotationDeg) * ease };
  for (const check of checks.filter(check => check.side === 'left')) assert.ok(Math.abs(check.targetDeg - expectedMetric(arm, 'left', check.metric)) < 1e-8);
  for (const stateChange of [{ phase: 'preparing' as const }, { status: 'paused' as const }, { sequenceId: 'other' }]) {
    assert.deepEqual(currentAssessmentChecks(plan, sequence, { ...state, ...stateChange }, 1500), []);
  }
  assert.deepEqual(currentAssessmentChecks({ ...plan, sequenceId: 'other' }, sequence, state, 1500), []);
});

test('resuming midway through a movement preserves the renderer position rather than restarting assessment targets', () => {
  const state: PlaybackState = { ...completed, stepIndex: 0, phase: 'moving', status: 'playing', updatedAt: 1000 };
  const resumed: PlaybackState = { ...state, updatedAt: 5000, phaseElapsedSeconds: 1.5 };
  assert.deepEqual(currentAssessmentChecks(plan, sequence, resumed, 5000), currentAssessmentChecks(plan, sequence, state, 2500));
  assert.deepEqual(currentAssessmentChecks(plan, sequence, resumed, 5250), currentAssessmentChecks(plan, sequence, state, 2750));
  assert.deepEqual(currentAssessmentChecks(plan, sequence, { ...resumed, status: 'paused' }, 5250), []);
});

test('practice assessment requires fresh post-phase observations and does not grade watching', () => {
  assert.equal(evaluateAdaptiveForm(sequence, plan, completed, observation(2000), 2000, null)?.status, 'unavailable');
  assert.match(evaluateAdaptiveForm(sequence, plan, completed, observation(2000), 2000, null)!.message, /Watch the demonstration/);
  assert.equal(evaluateAdaptiveForm(sequence, plan, completed, observation(2000), 2000, 1500)?.status, 'aligned');
  for (const sample of [observation(1200), observation(1000), observation(2500), null]) {
    assert.equal(evaluateAdaptiveForm(sequence, plan, completed, sample, 2000, 1500)?.status, 'not_observable');
  }
  assert.equal(evaluateAdaptiveForm(sequence, null, completed, observation(2000), 2000, 1500)?.status, 'unavailable');
  assert.equal(evaluateAdaptiveForm(sequence, plan, { ...completed, sequenceId: 'other' }, observation(2000), 2000, 1500), null);
});

test('a progress update does not invalidate fresh observations from the same moving phase', () => {
  const state: PlaybackState = { sequenceId: sequence.id, stepIndex: 0, phase: 'moving', status: 'playing', updatedAt: 2000, phaseElapsedSeconds: 0.3 };
  const result = evaluateAdaptiveForm(sequence, plan, state, observation(1950), 2000, 1500);
  assert.equal(result?.status, 'aligned');
  assert.equal(result?.observedAt, 1950);
  assert.equal(evaluateAdaptiveForm(sequence, plan, state, observation(1650), 2000, 1500)?.status, 'not_observable');
});

test('automatic readiness cannot start while watching, on rest pose or by replaying one frame', () => {
  const detector = new AutomaticPracticeDetector();
  for (const time of [1100, 1400, 1700, 2000]) {
    assert.equal(detector.update(sequence, plan, { ...completed, status: 'playing' }, observation(time), time), false);
  }
  const rest = observation(2100); rest.worldLandmarks!.left_wrist.y = 0.4;
  assert.equal(detector.update(sequence, plan, completed, rest, 2100), false);
  for (const time of [2200, 2400, 2600, 2800]) assert.equal(detector.update(sequence, plan, completed, observation(2200), time), false);
  assert.equal(detector.update(sequence, plan, completed, observation(3000), 3000), false, 'A gap resets readiness.');
  for (const time of [3200, 3400]) assert.equal(detector.update(sequence, plan, completed, observation(time), time), false);
  assert.equal(detector.update(sequence, plan, completed, observation(3800), 3800), true);
});

test('readiness resets after visibility loss and rejects stale or foreign sequence evidence', () => {
  const detector = new AutomaticPracticeDetector();
  for (const time of [1100, 1400, 1700]) assert.equal(detector.update(sequence, plan, completed, observation(time), time), false);
  const hidden = observation(1800); delete hidden.worldLandmarks!.left_wrist;
  assert.equal(detector.update(sequence, plan, completed, hidden, 1800), false);
  assert.equal(detector.update(sequence, plan, completed, observation(1800), 3000), false);
  assert.equal(detector.update(sequence, { ...plan, sequenceId: 'other' }, completed, observation(3100), 3100), false);
  assert.equal(detector.update(sequence, plan, { ...completed, updatedAt: 3500 }, observation(3400), 3500), false);
  for (const time of [3600, 3900, 4200]) assert.equal(detector.update(sequence, plan, completed, observation(time), time), false);
  assert.equal(detector.update(sequence, plan, completed, observation(4500), 4500), true);
});

test('invalid readiness timestamps cannot poison subsequent valid evidence', () => {
  const detector = new AutomaticPracticeDetector();
  for (const time of [NaN, Infinity, -Infinity]) assert.equal(detector.update(sequence, plan, completed, observation(time), 2000), false);
  assert.equal(detector.update(sequence, plan, completed, observation(2000), NaN), false);
  for (const time of [2100, 2400, 2700]) assert.equal(detector.update(sequence, plan, completed, observation(time), time), false);
  assert.equal(detector.update(sequence, plan, completed, observation(3000), 3000), true);
});

test('practice replay owns renderer callbacks while assessments keep the canonical sequence identity', () => {
  const session = new PracticeSession();
  for (const time of [1100, 1400, 1700, 2000]) session.update(sequence, plan, completed, observation(time), time);
  const first = session.snapshot;
  assert.ok(first.sequence); assert.notEqual(first.sequence.id, sequence.id);
  assert.equal(first.playback!.sequenceId, sequence.id); assert.equal(first.startedAt, 2000);
  assert.equal(session.recordPlayback(completed), false, 'A demonstration callback cannot control practice.');
  assert.equal(session.recordPlayback({ ...completed, sequenceId: first.sequence.id }), true);
  assert.equal(session.snapshot.playback!.sequenceId, sequence.id);
  const replacement = { ...sequence, id: 'replacement' };
  session.update(replacement, { ...plan, sequenceId: replacement.id }, { ...completed, sequenceId: replacement.id }, null, 2100);
  assert.equal(session.snapshot.sequence, null);
  assert.equal(session.recordPlayback({ ...completed, sequenceId: first.sequence.id }), false);
  for (const time of [2200, 2500, 2800, 3100]) session.update(replacement, { ...plan, sequenceId: replacement.id },
    { ...completed, sequenceId: replacement.id }, observation(time), time);
  const second = session.update(replacement, { ...plan, sequenceId: replacement.id },
    { ...completed, sequenceId: replacement.id }, observation(3400), 3400);
  assert.ok(second.sequence); assert.notEqual(second.sequence.id, first.sequence.id);
  session.reset(); assert.equal(session.snapshot.sequence, null); assert.equal(session.snapshot.startedAt, null);
});
