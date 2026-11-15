import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveFormPlan, SequenceFormEvaluator } from '../src/vision/checks/registry';
import { createWallAngelReference } from '../src/anatomy/upperBodySequence';
import { wallAngelDefaults } from '../src/anatomy/wallAngel';
import type { PlaybackState, PoseObservation } from '../src/shared/contracts';

const sequence = createWallAngelReference(wallAngelDefaults, 'form-program');
const playback: PlaybackState = { sequenceId: sequence.id, stepIndex: 1, phase: 'completed', status: 'completed', updatedAt: 1400 };
const observation = (observedAt: number): PoseObservation => ({ observedAt, mirrored: false, landmarks: {
  left_shoulder: { x: 0.35, y: 0.4, visibility: 1 }, right_shoulder: { x: 0.65, y: 0.4, visibility: 1 },
  left_elbow: { x: 0.15, y: 0.35, visibility: 1 }, right_elbow: { x: 0.85, y: 0.35, visibility: 1 },
  left_ear: { x: 0.35, y: 0.2, visibility: 1 }, right_ear: { x: 0.65, y: 0.2, visibility: 1 },
} });

test('composed sequences inherit checks only at an authored compatible pose', () => {
  assert.deepEqual([...deriveFormPlan(sequence).keys()], [1]);
  const evaluator = new SequenceFormEvaluator();
  const top = { ...playback, stepIndex: 0, phase: 'holding' as const, status: 'playing' as const };
  assert.equal(evaluator.evaluate(sequence, top, observation(2000), 2000)?.status, 'unavailable');
  assert.equal(evaluator.evaluate(sequence, playback, observation(2000), 2000)?.status, 'unavailable');
});

test('explicit final-pose practice needs distinct steady observations and immediately loses visibility', () => {
  const evaluator = new SequenceFormEvaluator();
  for (let index = 0; index < 4; index++) assert.equal(evaluator.evaluate(sequence, playback, observation(2000), 2000, 1500)?.status, 'not_observable');
  for (const time of [2100, 2200, 2300]) evaluator.evaluate(sequence, playback, observation(time), time, 1500);
  const good = evaluator.evaluate(sequence, playback, observation(2300), 2300, 1500);
  assert.equal(good?.status, 'aligned'); assert.equal(good?.mode, 'practice');
  const hidden = observation(2400); delete hidden.landmarks.left_elbow;
  assert.equal(evaluator.evaluate(sequence, playback, hidden, 2400, 1500)?.status, 'not_observable');
});

test('no camera callbacks cannot preserve an aligned form result', () => {
  const evaluator = new SequenceFormEvaluator();
  for (const time of [2000, 2100, 2200, 2300]) evaluator.evaluate(sequence, playback, observation(time), time, 1500);
  const lost = evaluator.evaluate(sequence, playback, observation(2300), 3501, 1500);
  assert.equal(lost?.status, 'not_observable'); assert.equal(lost?.observedAt, 3501);
  assert.equal(evaluator.evaluate(sequence, { ...playback, sequenceId: 'other' }, observation(3600), 3600, 1500), null);
});
