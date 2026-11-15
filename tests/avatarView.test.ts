import assert from 'node:assert/strict';
import test from 'node:test';
import { ViewRotation } from '../src/anatomy/viewRotation';
import { recommendedAvatarView } from '../src/anatomy/viewSelection';
import { getPartFocusCodes } from '../src/anatomy/regions';
import { compileUpperBodySequence, createWallAngelReference } from '../src/anatomy/upperBodySequence';
import { wallAngelDefaults } from '../src/anatomy/wallAngel';
import { plannedAvatarView, validatePresentationPlan } from '../src/shared/presentation';
import { ToolController } from '../server/live/ToolController';
import type { LiveAction } from '../src/live/protocol';

const sequence = createWallAngelReference(wallAngelDefaults, 'view-test');

test('view changes animate continuously, finish exactly and retarget without jumps', () => {
  const rotation = new ViewRotation();
  rotation.setView('back');
  assert.equal(rotation.angle, 0);
  assert.equal(rotation.advance(100), 0, 'A long first demand-frame delta must not cut.');
  let last = 0;
  for (let frame = 0; frame < 60; frame++) {
    const angle = rotation.advance(1 / 60);
    assert.ok(angle >= last && angle - last < 0.1); last = angle;
  }
  assert.equal(rotation.active, false); assert.ok(Math.abs(rotation.angle - Math.PI) < 1e-10);
  rotation.setView('front'); rotation.advance(0); rotation.advance(0.05);
  const interrupted = rotation.angle;
  rotation.setView('side'); assert.equal(rotation.angle, interrupted);
  rotation.advance(0); assert.equal(rotation.angle, interrupted);
  for (let frame = 0; frame < 60; frame++) rotation.advance(1 / 60);
  assert.ok(Math.abs(rotation.angle - Math.PI / 2) < 1e-10);
  assert.equal(rotation.active, false);
});

test('repeated targets do not restart a turn, and invalid deltas cannot corrupt rotation', () => {
  const rotation = new ViewRotation(); rotation.setView('back'); rotation.advance(0);
  for (let frame = 0; frame < 60; frame++) { rotation.setView('back'); rotation.advance(1 / 60); }
  assert.equal(rotation.active, false);
  rotation.setView('side'); const angle = rotation.angle;
  for (const delta of [NaN, Infinity, -1]) assert.equal(rotation.advance(delta), angle);
});

test('left-side rotation takes the opposite quarter turn and exposes left-side highlights', () => {
  const rotation = new ViewRotation(); rotation.setView('left_side'); rotation.advance(0);
  for (let frame = 0; frame < 60; frame++) rotation.advance(1 / 60);
  assert.ok(Math.abs(rotation.angle + Math.PI / 2) < 1e-10);
  const segment = compileUpperBodySequence(sequence).segments[0];
  assert.equal(recommendedAvatarView({ ...segment, focusCodes: getPartFocusCodes(['deltoid_lateral'], 'left') }), 'left_side');
  assert.equal(recommendedAvatarView({ ...segment, focusCodes: getPartFocusCodes(['deltoid_lateral'], 'right') }), 'side');
  assert.equal(recommendedAvatarView({ ...segment, focusCodes: new Set([...getPartFocusCodes(['deltoid_lateral'], 'left'), ...getPartFocusCodes(['deltoid_lateral'], 'right')]) }), 'front');
});

test('view plans reject forged identities, invalid views and missing/duplicate steps', () => {
  const input = { sequenceId: sequence.id, steps: [{ stepIndex: 0, view: 'back' }, { stepIndex: 1, view: 'front' }] };
  const plan = validatePresentationPlan(input, sequence)!;
  assert.equal(plannedAvatarView(plan, sequence, 1), 'front');
  assert.equal(plannedAvatarView(plan, { ...sequence, id: 'other' }, 0), undefined);
  assert.equal(validatePresentationPlan(null, sequence), null);
  for (const altered of [
    { ...input, sequenceId: 'other' }, { ...input, steps: input.steps.slice(0, 1) },
    { ...input, steps: [input.steps[0], input.steps[0]] },
    { ...input, steps: [{ stepIndex: 0, view: 'overhead' }, input.steps[1]] },
    { ...input, steps: [{ stepIndex: 0, view: 'back', angle: 10 }, input.steps[1]] },
  ]) assert.throws(() => validatePresentationPlan(altered, sequence));
});

test('automatic fallback exposes actual posterior highlights and neutral focus stays front', () => {
  const segment = compileUpperBodySequence(sequence).segments[0];
  assert.equal(recommendedAvatarView({ ...segment, focusCodes: getPartFocusCodes(['infraspinatus', 'trapezius_upper'], 'left') }), 'back');
  assert.equal(recommendedAvatarView({ ...segment, focusCodes: getPartFocusCodes(['biceps_brachii_short'], 'left') }), 'front');
  assert.equal(recommendedAvatarView(undefined, 'upper_back'), 'back');
  assert.equal(recommendedAvatarView(), 'front');
});

test('view-only tools preserve sequence and assessment, deduplicate and require user input', async () => {
  let plans = 0;
  const applied: LiveAction[] = [];
  const controller = new ToolController({ plan: async () => { plans++; return { sequence, message: '' }; },
    apply: async action => { applied.push(action); }, onPlanning: () => {} });
  controller.setSequence(sequence); controller.noteTextInput('Show me the back of the model.');
  const call = { id: 'back', name: 'set_avatar_view', args: { view: 'back' } };
  const result = await controller.handle(call); assert.equal(result.ok, true);
  assert.deepEqual(await controller.handle(call), result);
  assert.equal((await controller.handle({ ...call, id: 'excessive' })).ok, false);
  assert.equal(controller.currentSequence, sequence); assert.equal(plans, 0);
  assert.deepEqual(applied, [{ type: 'set_avatar_view', view: 'back' }]);
  controller.noteTextInput('Pick the best view again.');
  assert.equal((await controller.handle({ ...call, id: 'auto', args: { view: 'auto' } })).ok, true);
  assert.equal((await controller.handle({ ...call, id: 'invalid', args: { view: 'overhead' } })).ok, false);
  const noUser = new ToolController({ plan: async () => { throw new Error('No movement should be planned.'); }, apply: async () => { throw new Error('No view should apply.'); }, onPlanning: () => {} });
  const waiting = noUser.handle(call); noUser.close(); assert.equal((await waiting).ok, false);
});

test('view calls wait for independently arriving speech and cancellation prevents late changes', async () => {
  const applied: LiveAction[] = [];
  const controller = new ToolController({ plan: async () => ({ sequence, message: '' }), apply: async action => { applied.push(action); }, onPlanning: () => {} });
  const waiting = controller.handle({ id: 'early', name: 'set_avatar_view', args: { view: 'side' } });
  controller.noteInput('Show the side.', true);
  assert.equal((await waiting).ok, true);
  assert.deepEqual(applied, [{ type: 'set_avatar_view', view: 'side' }]);
  controller.beginSpeech();
  const cancelled = controller.handle({ id: 'cancelled', name: 'set_avatar_view', args: { view: 'front' } });
  controller.cancel('cancelled'); controller.noteInput('Show the front.', true);
  assert.equal((await cancelled).ok, false); assert.equal(applied.length, 1);
});
