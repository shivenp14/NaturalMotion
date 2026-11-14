import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentDefinition } from '../src/shared/contracts';
import { describeCatalog, parseMovementPlan } from '../src/agent/plan';

// Synthetic protocol fixture: this is NOT a supported exercise.
const catalog: ComponentDefinition[] = [{
  id: 'fixture_arm_motion',
  label: 'Fixture only',
  parameters: {
    speed: { minimum: 0.5, maximum: 2 },
    repetitions: { minimum: 1, maximum: 4, integer: true },
  },
  muscleRegionIds: [],
  cameraView: 'test',
  requiredLandmarks: [],
  supportedCheckIds: [],
}];

const candidate = {
  speech: 'Here is a demonstration.',
  steps: [{
    componentId: 'fixture_arm_motion',
    parameters: [{ name: 'speed', value: 0.75 }, { name: 'repetitions', value: 2 }],
  }],
};

test('model plan converts parameter pairs into validated renderer instructions', () => {
  const result = parseMovementPlan(candidate, catalog, 'fixture-session');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.sequence, {
      id: 'fixture-session',
      steps: [{ componentId: 'fixture_arm_motion', parameters: { speed: 0.75, repetitions: 2 } }],
    });
  }
});

test('requests without executable steps remain spoken replies', () => {
  const result = parseMovementPlan({ speech: 'I can explain the demonstration.', steps: [] }, [], 'fixture-session');
  assert.deepEqual(result, { ok: true, speech: 'I can explain the demonstration.' });
});

test('never treats a synthetic component as enabled when the real catalog is empty', () => {
  const result = parseMovementPlan(candidate, [], 'fixture-session');
  assert.equal(result.ok, false);
  assert.equal(describeCatalog([]), 'No movements are implemented yet.');
});

test('rejects unregistered, incomplete, out-of-bounds, and duplicated instructions', () => {
  const invalid = [
    { ...candidate, steps: [{ ...candidate.steps[0], componentId: 'invented' }] },
    { ...candidate, steps: [{ ...candidate.steps[0], parameters: [{ name: 'speed', value: 1 }] }] },
    { ...candidate, steps: [{ ...candidate.steps[0], parameters: [{ name: 'speed', value: 3 }, { name: 'repetitions', value: 2 }] }] },
    { ...candidate, steps: [{ ...candidate.steps[0], parameters: [{ name: 'speed', value: 1 }, { name: 'speed', value: 1 }, { name: 'repetitions', value: 2 }] }] },
    { ...candidate, steps: [{ ...candidate.steps[0], parameters: [{ name: 'speed', value: 1 }, { name: 'repetitions', value: 1.5 }] }] },
    { speech: '', steps: [] },
    { speech: 'No', steps: 'not an array' },
  ];
  for (const input of invalid) assert.equal(parseMovementPlan(input, catalog, 'fixture-session').ok, false);
});
