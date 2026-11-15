import assert from 'node:assert/strict';
import test from 'node:test';
import { DemonstrationInvitation, PRACTICE_INVITATION } from '../server/live/demonstrationInvitation';
import { createWallAngelReference } from '../src/anatomy/upperBodySequence';
import { wallAngelDefaults } from '../src/anatomy/wallAngel';
import { buildAssessmentPlan } from '../src/vision/assessmentPlan';
import type { PlaybackState } from '../src/shared/contracts';

const sequence = createWallAngelReference(wallAngelDefaults, 'invitation');
const plan = buildAssessmentPlan(sequence, [{ stepIndex: 1, side: 'left', metric: 'forearm_direction', toleranceDeg: 20 }]);
const playback: PlaybackState = { sequenceId: sequence.id, stepIndex: 1, phase: 'completed', status: 'completed', updatedAt: 1000 };

test('practice invitation waits for the completed initial demonstration and invites only once', () => {
  const gate = new DemonstrationInvitation();
  for (const update of [{ phase: 'moving' as const }, { status: 'paused' as const }, { stepIndex: 0 }]) {
    assert.equal(gate.take(sequence, plan, { ...playback, ...update }, null, false, 1000), null);
  }
  assert.equal(gate.take(sequence, plan, playback, null, false, 1000), PRACTICE_INVITATION);
  assert.equal(gate.take(sequence, plan, playback, null, false, 1200), null);
});

test('invitation defers while conversation is busy and never interrupts a practice replay', () => {
  const gate = new DemonstrationInvitation();
  assert.equal(gate.take(sequence, plan, playback, null, true, 1000), null);
  assert.equal(gate.take(sequence, plan, playback, 1000, false, 1100), null);
  assert.equal(gate.take(sequence, plan, playback, null, false, 1200), PRACTICE_INVITATION);
});

test('invitation requires matching assessment and recent completion; a replacement gets a new invitation', () => {
  const gate = new DemonstrationInvitation();
  for (const input of [null, { ...plan, checks: [] }, { ...plan, sequenceId: 'other' }]) {
    assert.equal(gate.take(sequence, input, playback, null, false, 1000), null);
  }
  assert.equal(gate.take(sequence, plan, playback, null, false, 62000), null);
  assert.equal(gate.take(sequence, plan, { ...playback, updatedAt: 3000 }, null, false, 1000), null);
  assert.equal(gate.take(sequence, plan, playback, null, false, 1000), PRACTICE_INVITATION);
  assert.equal(gate.take({ ...sequence, id: 'replacement' }, { ...plan, sequenceId: 'replacement' }, { ...playback, sequenceId: 'replacement' }, null, false, 1000), PRACTICE_INVITATION);
});
