import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentDefinition, FormEvent, MovementSequence, PlaybackState } from '../src/shared/contracts';
import { isCurrentFormEvent } from '../src/shared/formEvents';
import { validateSequence } from '../src/shared/validateSequence';

// Synthetic protocol fixtures, not a registered exercise or movement prescription.
const catalog: ComponentDefinition[] = [{ id: 'fixture', label: 'Test only', parameters: {
  speed: { minimum: 0.5, maximum: 2 }, repetitions: { minimum: 1, maximum: 4, integer: true },
}, muscleRegionIds: [], cameraView: 'test', requiredLandmarks: [], supportedCheckIds: ['alignment'] }];
const sequence: MovementSequence = { id: 'session-1', steps: [{ componentId: 'fixture', parameters: { speed: 1, repetitions: 2 } }] };

test('accepts a supported sequence and copies its data', () => {
  const result = validateSequence(sequence, catalog);
  assert.equal(result.ok, true);
  if (result.ok) { assert.deepEqual(result.sequence, sequence); assert.notEqual(result.sequence, sequence); }
});

test('rejects unconfigured movement, empty catalog, extra and missing parameters', () => {
  assert.equal(validateSequence(sequence, []).ok, false);
  assert.equal(validateSequence({ ...sequence, steps: [{ componentId: 'invented', parameters: {} }] }, catalog).ok, false);
  for (const parameters of [{ speed: 1 }, { speed: 1, repetitions: 2, extra: 1 }]) {
    assert.equal(validateSequence({ ...sequence, steps: [{ componentId: 'fixture', parameters }] }, catalog).ok, false);
  }
});

test('rejects nonfinite, out-of-bounds, and fractional integer parameters', () => {
  for (const parameters of [
    { speed: NaN, repetitions: 2 }, { speed: Infinity, repetitions: 2 },
    { speed: 3, repetitions: 2 }, { speed: 1, repetitions: 1.5 },
  ]) assert.equal(validateSequence({ ...sequence, steps: [{ componentId: 'fixture', parameters }] }, catalog).ok, false);
});

test('rejects malformed or excessive agent output', () => {
  for (const input of [null, [], {}, { id: ' ', steps: [] }, { ...sequence, extra: true },
    { ...sequence, steps: [] }, { ...sequence, steps: Array(33).fill(sequence.steps[0]) }]) {
    assert.equal(validateSequence(input, catalog).ok, false);
  }
});

const playback: PlaybackState = { sequenceId: 'session-1', stepIndex: 0, phase: 'moving', status: 'playing', updatedAt: 1000 };
const event: FormEvent = { sequenceId: 'session-1', stepIndex: 0, checkId: 'alignment', status: 'not_observable', observedAt: 1100, measurements: {} };

test('accepts current observations without treating not_observable as success', () => {
  assert.equal(isCurrentFormEvent(event, playback, sequence, catalog, 1200, 500), true);
  assert.equal(event.status, 'not_observable');
});

test('ignores wrong-sequence, wrong-step, unsupported, stale, and future events', () => {
  for (const change of [{ sequenceId: 'old' }, { stepIndex: 1 }, { checkId: 'invented' },
    { observedAt: 900 }, { observedAt: 1300 }]) {
    assert.equal(isCurrentFormEvent({ ...event, ...change }, playback, sequence, catalog, 1200, 500), false);
  }
  assert.equal(isCurrentFormEvent(event, playback, sequence, catalog, 2000, 500), false);
  assert.equal(isCurrentFormEvent(event, { ...playback, status: 'paused' }, sequence, catalog, 1200, 500), false);
});
