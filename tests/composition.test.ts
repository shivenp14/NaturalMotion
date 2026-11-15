import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentDefinition, FormEvent, MovementSequence, PlaybackState } from '../src/shared/contracts';
import { isCurrentFormEvent } from '../src/shared/formEvents';
import { validateSequence } from '../src/shared/validateSequence';

// Synthetic channels only; these do not register executable movements.
const definition = (id: string, channel: string): ComponentDefinition => ({
  id, label: 'Protocol fixture', parameters: { target: { minimum: 0, maximum: 10 } },
  controlledChannels: [channel], muscleRegionIds: [], cameraView: 'test',
  requiredLandmarks: [], supportedCheckIds: [`${id}-check`],
});
const catalog = [definition('a', 'channel-a'), definition('b', 'channel-b'), definition('conflict', 'channel-a')];
const group = { parallel: [{ componentId: 'a', parameters: { target: 2 } }, { componentId: 'b', parameters: { target: 4 } }], durationSeconds: 3, holdSeconds: 1 };
const sequence: MovementSequence = { id: 'composition-test', steps: [group] };
const fixturePolicy = () => null;

test('parallel commands stay in one step and are copied before trusted policy evaluation', () => {
  const result = validateSequence(sequence, catalog, (validated) => {
    assert.notEqual(validated, sequence);
    assert.notEqual(validated.steps[0], group);
    assert.ok('parallel' in validated.steps[0]);
    assert.notEqual(validated.steps[0].parallel[0].parameters, group.parallel[0].parameters);
    return null;
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.sequence, sequence);
});

test('composition fails closed without an execution policy or when its policy rejects or throws', () => {
  assert.equal(validateSequence(sequence, catalog).ok, false);
  assert.deepEqual(validateSequence(sequence, catalog, () => 'Unsupported transition.'), { ok: false, error: 'Unsupported transition.' });
  assert.equal(validateSequence(sequence, catalog, () => { throw new Error('Unavailable'); }).ok, false);
});

test('parallel groups reject conflicts, unknown members, unbounded channels and invalid parameters', () => {
  for (const member of [
    { componentId: 'conflict', parameters: { target: 1 } },
    { componentId: 'a', parameters: { target: 1 } },
    { componentId: 'invented', parameters: { target: 1 } },
    { componentId: 'b', parameters: { target: Infinity } },
    { componentId: 'b', parameters: { target: 11 } },
  ]) {
    assert.equal(validateSequence({ ...sequence, steps: [{ ...group, parallel: [group.parallel[0], member] }] }, catalog, fixturePolicy).ok, false);
  }
  const undeclared = [{ ...catalog[0], controlledChannels: undefined }, catalog[1]];
  assert.equal(validateSequence(sequence, undeclared, fixturePolicy).ok, false);
});

test('parallel groups reject ambiguous shapes, excessive members and invalid timing', () => {
  for (const change of [
    { parallel: [] }, { parallel: Array(13).fill(group.parallel[0]) },
    { durationSeconds: 0 }, { durationSeconds: NaN }, { durationSeconds: 31 },
    { holdSeconds: -1 }, { holdSeconds: Infinity }, { holdSeconds: 11 },
    { componentId: 'a' }, { extra: true },
  ]) assert.equal(validateSequence({ ...sequence, steps: [{ ...group, ...change }] }, catalog, fixturePolicy).ok, false);
});

test('each group member can emit feedback while stale and unobservable states remain distinct', () => {
  const playback: PlaybackState = { sequenceId: sequence.id, stepIndex: 0, phase: 'holding', status: 'playing', updatedAt: 1000 };
  const event: FormEvent = { sequenceId: sequence.id, stepIndex: 0, checkId: 'b-check', status: 'not_observable', observedAt: 1100, measurements: {} };
  assert.equal(isCurrentFormEvent(event, playback, sequence, catalog, 1200, 500), true);
  assert.equal(event.status, 'not_observable');
  assert.equal(isCurrentFormEvent({ ...event, checkId: 'a-check' }, playback, sequence, catalog, 1200, 500), true);
  for (const change of [{ checkId: 'conflict-check' }, { stepIndex: 1 }, { observedAt: 900 }]) {
    assert.equal(isCurrentFormEvent({ ...event, ...change }, playback, sequence, catalog, 1200, 500), false);
  }
});
