import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Vector3, MathUtils } from 'three';
import { createWallAngelReference, compileUpperBodySequence, sampleUpperBodyProgram } from '../src/anatomy/upperBodySequence';
import { wallAngelDefaults } from '../src/anatomy/wallAngel';
import type { UpperBodyPose } from '../src/anatomy/upperBodyPose';
import { initialUpperBodyPose } from '../src/anatomy/upperBodyPose';
import type { PlaybackState, PoseObservation } from '../src/shared/contracts';
import type { PracticeAttempt, PracticeReview, PracticeSample } from '../src/shared/practice';
import { ASSESSMENT_METRICS } from '../src/shared/assessment';
import { buildAssessmentPlan } from '../src/vision/assessmentPlan';
import { measureAssessment } from '../src/vision/assessmentGeometry';
import { RepetitionTracker, reviewPracticeAttempt } from '../src/vision/repetitionTracker';
import { SelfPacedPractice } from '../src/vision/selfPacedPractice';
import { validatePracticeAttempt } from '../src/vision/validatePracticeAttempt';

const sequence = createWallAngelReference(wallAngelDefaults, 'self-paced');
const program = compileUpperBodySequence(sequence);
const plan = buildAssessmentPlan(sequence, sequence.steps.flatMap((_, stepIndex) => (['left', 'right'] as const).flatMap(side =>
  ASSESSMENT_METRICS.map(metric => ({ stepIndex, side, metric, toleranceDeg: 20 })))));
const demo: PlaybackState = { sequenceId: sequence.id, stepIndex: 1, phase: 'completed', status: 'completed', updatedAt: 1000 };

/** Synthetic camera geometry, not human quality evidence. */
function observation(at: number, pose: UpperBodyPose): PoseObservation {
  const result: PoseObservation = { observedAt: at, mirrored: false, landmarks: {}, worldLandmarks: {} };
  const put = (name: string, p: Vector3) => {
    result.worldLandmarks![name] = { x: p.x, y: p.y, z: p.z };
    result.landmarks[name] = { x: 0.5 + p.x * 0.5, y: 0.8 - p.y * 0.5, visibility: 1 };
  };
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? 1 : -1;
    const arm = pose[side];
    const e = MathUtils.degToRad(arm.elevationDeg), f = MathUtils.degToRad(arm.elbowFlexionDeg);
    const upper = new Vector3(sign * Math.sin(e), -Math.cos(e), -0.22).normalize();
    const forearm = new Vector3(sign * Math.sin(e + f), -Math.cos(e + f), 0)
      .applyQuaternion(new Quaternion().setFromAxisAngle(upper, sign * MathUtils.degToRad(arm.externalRotationDeg - 90)));
    upper.x *= -1; forearm.x *= -1;
    const shoulder = new Vector3(-sign * 0.2, 1, 0);
    const elbow = shoulder.clone().addScaledVector(upper, 0.3);
    put(`${side}_shoulder`, shoulder); put(`${side}_elbow`, elbow); put(`${side}_wrist`, elbow.clone().addScaledVector(forearm, 0.3));
    put(`${side}_hip`, new Vector3(-sign * 0.17, 0, 0));
  }
  return result;
}
function sample(value: PoseObservation): PracticeSample {
  return { observedAt: value.observedAt, measurements: Object.fromEntries((['left', 'right'] as const).flatMap(side =>
    ASSESSMENT_METRICS.map(metric => [`${side}_${metric}`, measureAssessment(value, side, metric)]))) };
}
function attempt(duration: number, alter?: (sample: PracticeSample) => void): PracticeAttempt {
  const samples: PracticeSample[] = [];
  // The person performs a continuous up-and-return, with no authored one-second hold.
  for (let at = 0; at <= duration + 500; at += 100) {
    const fraction = Math.min(at / duration, 1);
    const time = fraction < 0.5 ? fraction * 6 : 4 + (fraction - 0.5) * 6;
    const value = sample(observation(2000 + at, sampleUpperBodyProgram(program, time).pose));
    alter?.(value); samples.push(value);
  }
  return { sequenceId: sequence.id, attemptId: `attempt-${duration}`, startedAt: 2000, endedAt: samples.at(-1)!.observedAt, samples };
}

test('normal fast and slow repetitions complete independently of the animation clock without checkpoint holds', () => {
  for (const duration of [2000, 4000, 12000]) {
    const input = attempt(duration), tracker = new RepetitionTracker(sequence);
    input.samples.forEach(value => tracker.observe(value));
    assert.equal(tracker.completed, true, `Completion at ${duration}ms`);
    assert.equal(reviewPracticeAttempt(sequence, plan, input).status, 'aligned', `Review at ${duration}ms`);
  }
});

test('stationary guide groups are skipped instead of becoming mandatory practice checkpoints', () => {
  const stationary = structuredClone(sequence.steps[0]); assert.ok('parallel' in stationary);
  for (const command of stationary.parallel) command.parameters.toDeg = command.parameters.fromDeg;
  const heldSequence = { id: 'with-start-hold', steps: [stationary, ...sequence.steps] };
  const heldPlan = buildAssessmentPlan(heldSequence, heldSequence.steps.flatMap((_, stepIndex) => (['left', 'right'] as const).flatMap(side =>
    ASSESSMENT_METRICS.map(metric => ({ stepIndex, side, metric, toleranceDeg: 20 })))));
  const input = { ...attempt(4000), sequenceId: heldSequence.id };
  assert.equal(reviewPracticeAttempt(heldSequence, heldPlan, input).status, 'aligned');
});

test('a static starting pose and repeated frames cannot fabricate a finished repetition', () => {
  const input = attempt(2000);
  const held = sample(observation(2000, initialUpperBodyPose()));
  input.samples = input.samples.map(row => ({ observedAt: row.observedAt, measurements: held.measurements }));
  assert.equal(reviewPracticeAttempt(sequence, plan, input).status, 'incomplete');
  const tracker = new RepetitionTracker(sequence);
  for (let i = 0; i < 30; i++) tracker.observe(held);
  assert.equal(tracker.completed, false);
});

test('review gives one retrospective correction and recognizes a subsequent corrected repetition', () => {
  const bad = attempt(4000, row => { const n = row.measurements.left_elbow_bend; if (n !== null) row.measurements.left_elbow_bend = Math.max(0, n - 45); });
  const review = reviewPracticeAttempt(sequence, plan, bad);
  assert.equal(review.status, 'needs_adjustment'); assert.match(review.message, /next repetition.*left elbow/i);
  const corrected = reviewPracticeAttempt(sequence, plan, attempt(4000), review);
  assert.equal(corrected.status, 'aligned'); assert.match(corrected.message, /looked better/);
});

test('a smaller excursion can complete the return and receive a range tip without a checkpoint hold', () => {
  const input = attempt(4000);
  input.samples = input.samples.map((row, index) => {
    const fraction = Math.min(index * 100 / 4000, 1);
    const time = fraction < 0.5 ? fraction * 4 : (1 - fraction) * 4;
    return sample(observation(row.observedAt, sampleUpperBodyProgram(program, time).pose));
  });
  const review = reviewPracticeAttempt(sequence, plan, input);
  assert.equal(review.status, 'needs_adjustment'); assert.match(review.message, /smaller movement/);
});

test('a corrected partial check plan gets positive improvement feedback with appropriately limited wording', () => {
  const partial = buildAssessmentPlan(sequence, [{ stepIndex: 1, side: 'left', metric: 'elbow_bend', toleranceDeg: 20 }]);
  const bad = attempt(4000, row => { row.measurements.left_elbow_bend = Math.max(0, row.measurements.left_elbow_bend! - 45); });
  const first = reviewPracticeAttempt(sequence, partial, bad);
  assert.equal(first.status, 'needs_adjustment');
  const corrected = reviewPracticeAttempt(sequence, partial, attempt(4000), first);
  assert.equal(corrected.status, 'aligned'); assert.match(corrected.message, /looked better.*could assess/);
});

test('occluded wrists never become a positive whole-repetition judgment', () => {
  const input = attempt(4000, row => { row.measurements.left_elbow_bend = null; row.measurements.left_forearm_direction = null; });
  assert.equal(reviewPracticeAttempt(sequence, plan, input).status, 'not_observable');
});

test('tracking loss mid-movement cannot be summarized as good form', () => {
  const input = attempt(12000);
  input.samples = input.samples.filter(row => row.observedAt < 4000 || row.observedAt > 5500);
  assert.notEqual(reviewPracticeAttempt(sequence, plan, input).status, 'aligned');
});

test('isolated geometry spikes cannot fabricate a whole repetition', () => {
  const input = attempt(2000);
  const held = sample(observation(2000, initialUpperBodyPose()));
  input.samples = input.samples.map((row, i) => ({ observedAt: row.observedAt, measurements: i === 3 || i === 4 ? row.measurements : held.measurements }));
  assert.notEqual(reviewPracticeAttempt(sequence, plan, input).status, 'aligned');
});

test('recording begins after the demonstration with no pose gate, and waits for the finish cue', () => {
  const session = new SelfPacedPractice();
  session.update(sequence, plan, demo, null, 1200);
  assert.equal(session.snapshot.stage, 'performing');
  const id = session.snapshot.recordingId;
  for (const row of attempt(2000).samples) {
    const fraction = Math.min((row.observedAt - 2000) / 2000, 1);
    const time = fraction < 0.5 ? fraction * 6 : 4 + (fraction - 0.5) * 6;
    session.update(sequence, plan, demo, observation(row.observedAt, sampleUpperBodyProgram(program, time).pose), row.observedAt);
    assert.equal(session.snapshot.stage, 'performing'); assert.equal(session.snapshot.review, null);
  }
  // More time and missing camera frames are not completion cues.
  session.update(sequence, plan, demo, null, 20000);
  assert.equal(session.snapshot.stage, 'performing'); assert.equal(session.snapshot.recordingId, id);
  session.finish(20100);
  assert.equal(session.snapshot.review?.status, 'aligned');
});

test('finish without visible landmarks reports uncertainty, and a retry is explicit', () => {
  const session = new SelfPacedPractice(); session.update(sequence, plan, demo, null, 1200);
  session.finish(2300);
  assert.equal(session.snapshot.review?.status, 'not_observable');
  const firstId = session.snapshot.recordingId;
  for (let at = 2400; at <= 3000; at += 100) session.update(sequence, plan, demo, observation(at, initialUpperBodyPose()), at);
  assert.equal(session.snapshot.stage, 'review'); assert.equal(session.snapshot.recordingId, firstId);
  session.requestStart(); session.update(sequence, plan, demo, null, 3200);
  assert.equal(session.snapshot.stage, 'performing'); assert.equal(session.snapshot.review, null);
  assert.notEqual(session.snapshot.recordingId, firstId);
});

test('positioning before the movement does not produce a false correction', () => {
  const input = attempt(4000);
  const resting = initialUpperBodyPose(); resting.left.elevationDeg = 0; resting.right.elevationDeg = 0;
  const prefix = Array.from({ length: 30 }, (_, i) => sample(observation(1000 + i * 100, resting)));
  const rows = input.samples.map(row => ({ ...row, observedAt: row.observedAt + 4000 }));
  assert.equal(reviewPracticeAttempt(sequence, plan, { ...input, startedAt: 1000, endedAt: rows.at(-1)!.observedAt, samples: [...prefix, ...rows] }).status, 'aligned');
});

test('an under-observed attempt stays quiet until finished, then gives uncertainty rather than praise', () => {
  const session = new SelfPacedPractice(); session.update(sequence, plan, demo, null, 1200);
  for (let at = 2000; at <= 5000; at += 100) session.update(sequence, plan, demo, observation(at, initialUpperBodyPose()), at);
  assert.equal(session.snapshot.stage, 'performing'); assert.equal(session.snapshot.review, null);
  session.finish(5100); assert.notEqual((session.snapshot.review as PracticeReview | null)?.status, 'aligned');
});

test('a capture limit does not cause an unsolicited review or an invalid finish payload', () => {
  const session = new SelfPacedPractice(); session.update(sequence, plan, demo, null, 1200);
  session.update(sequence, plan, demo, null, 130000);
  assert.equal(session.snapshot.stage, 'performing'); assert.equal(session.snapshot.review, null);
  session.finish(131000);
  assert.equal((session.snapshot.review as PracticeReview | null)?.status, 'not_observable');
  assert.doesNotThrow(() => validatePracticeAttempt(session.snapshot.attempt, sequence.id, 131000));
});

test('practice evidence validation rejects stale, fabricated and out-of-order data', () => {
  const input = attempt(2000);
  assert.deepEqual(validatePracticeAttempt(input, sequence.id, input.endedAt + 100), input);
  for (const bad of [ { ...input, sequenceId: 'other' }, { ...input, samples: [...input.samples].reverse() },
    { ...input, message: 'Perfect form' }, { ...input, samples: [{ ...input.samples[0], measurements: { invented: 0 } }] } ]) {
    assert.throws(() => validatePracticeAttempt(bad, sequence.id, input.endedAt));
  }
  assert.throws(() => validatePracticeAttempt(input, sequence.id, input.endedAt + 20000));
});


test('consistent visible differences near tolerance get a correction, not a visibility retry loop', () => {
  for (const offset of [-31, 31, 34]) {
    const input = attempt(4000, row => { row.measurements.left_elbow_bend = row.measurements.left_elbow_bend! + offset; });
    const review = reviewPracticeAttempt(sequence, plan, input);
    assert.equal(review.status, 'needs_adjustment', `Stable ${offset} degree difference`);
    assert.equal(review.checkId, 'left_elbow_bend');
    assert.match(review.message, offset < 0 ? /more bent/ : /straighter/);
    assert.match(review.message, /ready to try again/);
    assert.equal(reviewPracticeAttempt(sequence, plan, attempt(4000), review).status, 'aligned');
  }
});

test('inconsistent borderline measurements remain uncertain without blaming visibility', () => {
  let index = 0;
  const input = attempt(4000, row => {
    row.measurements.left_elbow_bend = row.measurements.left_elbow_bend! + (index++ % 5 < 3 ? 29 : -10);
  });
  const review = reviewPracticeAttempt(sequence, plan, input);
  assert.equal(review.status, 'not_observable');
  assert.match(review.message, /measurements varied/);
  assert.doesNotMatch(review.message, /arms fully visible/);
});

test('small visible arm variations are accepted with the conversational review grace', () => {
  for (const offset of [-16, 16]) {
    const input = attempt(4000, row => { row.measurements.left_elbow_bend = row.measurements.left_elbow_bend! + offset; });
    assert.equal(reviewPracticeAttempt(sequence, plan, input).status, 'aligned', JSON.stringify(reviewPracticeAttempt(sequence, plan, input)));
  }
});
