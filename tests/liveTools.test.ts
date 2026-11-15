import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolController } from '../server/live/ToolController';
import { createWallAngelReference } from '../src/anatomy/upperBodySequence';
import { wallAngelDefaults } from '../src/anatomy/wallAngel';
import type { LiveAction } from '../src/live/protocol';

const sequence = createWallAngelReference(wallAngelDefaults, 'tool-test');
const call = (id: string) => ({ id, name: 'request_movement', args: { request: 'Show a wall angel.' } });

test('one plan per user turn and duplicate call IDs never restart the demonstration', async () => {
  let planned = 0;
  const applied: LiveAction[] = [];
  const controller = new ToolController({ plan: async () => { planned++; return { sequence, message: '' }; },
    apply: async action => { applied.push(action); }, onPlanning: () => {} });
  controller.noteInput('Show a wall angel.', true);
  controller.finishTurn(); // The provider can finish its tool-call turn before delivering the call.
  const first = await controller.handle(call('a'));
  assert.equal(first.ok, true);
  assert.deepEqual(await controller.handle(call('a')), first);
  assert.equal((await controller.handle(call('b'))).ok, false);
  assert.equal(planned, 1); assert.equal(applied.length, 1);
  controller.noteInput('Make it slower.', true);
  assert.equal((await controller.handle(call('c'))).ok, true);
  assert.equal(planned, 2);
});

test('late transcription can establish the request, but a camera-only tool call cannot', async () => {
  let planned = 0;
  const controller = new ToolController({ plan: async () => { planned++; return { sequence, message: '' }; },
    apply: async () => {}, onPlanning: () => {} });
  const pending = controller.handle(call('early'));
  controller.noteInput('Show a wall angel.', true);
  assert.equal((await pending).ok, true); assert.equal(planned, 1);
  const cameraOnly = new ToolController({ plan: async () => { throw new Error('Must not plan without user input.'); },
    apply: async () => {}, onPlanning: () => {} });
  const unrequested = cameraOnly.handle(call('camera'));
  cameraOnly.close();
  assert.equal((await unrequested).ok, false);
});

test('stop bypasses a pending planner and late plans cannot be applied', async () => {
  let finish!: (value: { sequence: typeof sequence; message: string }) => void;
  const applied: LiveAction[] = [];
  const controller = new ToolController({ plan: () => new Promise(resolve => { finish = resolve; }),
    apply: async action => { applied.push(action); }, onPlanning: () => {} });
  controller.noteInput('Show a wall angel.', true);
  const planning = controller.handle(call('a'));
  assert.equal((await controller.handle({ id: 'stop', name: 'stop_movement', args: {} })).ok, true);
  finish({ sequence, message: '' });
  assert.equal((await planning).ok, false);
  assert.deepEqual(applied, [{ type: 'stop_movement' }]);
});

test('unknown arguments, failed app acknowledgment and new speech never report success', async () => {
  const controller = new ToolController({ plan: async () => ({ sequence, message: '' }),
    apply: async () => { throw new Error('Renderer unavailable.'); }, onPlanning: () => {} });
  controller.noteInput('Show a wall angel.', true);
  assert.equal((await controller.handle({ ...call('bad'), args: { request: 'x', jointAngle: 999 } })).ok, false);
  assert.equal((await controller.handle(call('rejected'))).ok, false);
  assert.equal(controller.currentSequence, null);
  assert.equal((await controller.handle({ id: 'unknown', name: 'invented', args: {} })).ok, false);
});

test('stop remains available after the session tool-call limit', async () => {
  const applied: LiveAction[] = [];
  const controller = new ToolController({ plan: async () => { throw new Error('Not requested.'); },
    apply: async action => { applied.push(action); }, onPlanning: () => {} });
  for (let index = 0; index < 128; index++) await controller.handle({ id: `invalid-${index}`, name: 'unknown', args: {} });
  assert.equal((await controller.handle({ id: 'stop', name: 'stop_movement', args: {} })).ok, true);
  assert.deepEqual(applied, [{ type: 'stop_movement' }]);
});

test('an explicit text request opens a new turn after speech activity was observed', async () => {
  const utterances: string[] = [];
  const controller = new ToolController({ plan: async utterance => { utterances.push(utterance); return { sequence, message: '' }; },
    apply: async () => {}, onPlanning: () => {} });
  controller.beginSpeech(); controller.noteInput('Show a wall angel.', true); controller.endSpeech();
  assert.equal((await controller.handle(call('spoken'))).ok, true);
  controller.finishTurn(); controller.noteTextInput('Make it slower.');
  assert.equal((await controller.handle(call('typed'))).ok, true);
  assert.deepEqual(utterances, ['Show a wall angel.', 'Make it slower.']);
});
