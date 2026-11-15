import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentDefinition, FormEvent, MovementSequence, ParallelMovementStep, PlaybackState } from '../src/shared/contracts';
import type { CheckFeedbackDefinition } from '../src/agent/types';
import { componentCatalog } from '../src/shared/catalog';
import { validateSequence } from '../src/shared/validateSequence';
import { validateAgentReturn } from '../src/agent/validateAgentReturn';
import { decideFromFormEvent, emptyFeedbackState } from '../src/agent/decide';
import { createResponseSchema } from '../server/agent';

// Synthetic channels follow the anatomy contract, without registering any app movement.
export const catalog: ComponentDefinition[] = ['a', 'b'].map(id => ({ id, label: 'Protocol test',
  parameters: { fromDeg: { minimum: 0, maximum: 100 }, toDeg: { minimum: 0, maximum: 100 } },
  controlledChannels: [id], muscleRegionIds: [], cameraView: 'test', requiredLandmarks: [], supportedCheckIds: [`${id}-check`] }));
const group: ParallelMovementStep = { parallel: catalog.map(c => ({ componentId: c.id, parameters: { fromDeg: 0, toDeg: 80 } })),
  durationSeconds: 3, holdSeconds: 1 };
const sequence: MovementSequence = { id: 'seq', steps: [group] };
const cues = { correct: 'Correction fixture', position: 'Visibility fixture', improved: 'Acknowledgment fixture' };
const checks: CheckFeedbackDefinition[] = catalog.map(c => ({ componentId: c.id, checkId: `${c.id}-check`, phases: ['holding'],
  correctionCueId: 'correct', repositionCueId: 'position', acknowledgmentCueId: 'improved' }));
const context = { catalog, cues, currentSequence: sequence, compositionPolicy: () => null };
const response = (actions: unknown[], type = 'user_utterance') => ({ decisionId: 'd', trigger: { type, id: 'u' }, actions });

test('production remains unconfigured and old worker3 sequence format is rejected', () => {
  assert.deepEqual(componentCatalog, []);
  assert.equal(validateSequence(sequence, componentCatalog, context.compositionPolicy).ok, false);
  assert.equal(validateSequence({ sequenceId: 'seq', steps: [{ stepId: 's', componentId: 'a',
    parameters: { speed: 'normal', side: 'both', repetitions: 2, holdSeconds: 2 } }] }, catalog).ok, false);
});

test('agent preserves timed simultaneous groups unchanged through playback and modifications', () => {
  const replacement = { ...group, durationSeconds: 5 };
  const checked = validateAgentReturn(response([{ type: 'play_sequence', sequence },
    { type: 'modify_playback', stepIndex: 0, step: replacement }, { type: 'replay_demonstration', stepIndex: 0 }]), context);
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  assert.deepEqual(checked.value.actions[0], { type: 'play_sequence', sequence });
  assert.deepEqual(checked.value.actions[1], { type: 'modify_playback', stepIndex: 0, step: replacement });
  assert.notEqual(checked.value.actions[0].type === 'play_sequence' && checked.value.actions[0].sequence, sequence);
});

test('renderer policy sees full modified sequence; rejects bad transitions and absent policy', () => {
  const input = response([{ type: 'modify_playback', stepIndex: 0, step: { ...group, durationSeconds: 5 } }]);
  assert.equal(validateAgentReturn(input, { ...context, compositionPolicy: undefined }).ok, false);
  let called = false;
  const result = validateAgentReturn(input, { ...context, compositionPolicy: full => {
    called = true; assert.equal(full.id, sequence.id); assert.equal(full.steps.length, 1);
    return 'Unsupported cross-joint transition';
  } });
  assert.equal(called, true); assert.equal(result.ok, false);
});

test('rejects invalid index, legacy step ID, malformed replacement, conflicting commands and cue injection', () => {
  for (const action of [
    ...[-1, 0.5, 1, NaN].map(stepIndex => ({ type: 'modify_playback', stepIndex, step: group })),
    { type: 'modify_playback', stepId: 's', parameters: { speed: 'slow' } },
    { type: 'modify_playback', stepIndex: 0, step: { ...group, parallel: [group.parallel[0], group.parallel[0]] } },
    { type: 'replay_demonstration', stepIndex: -1 }, { type: 'replay_demonstration', stepId: 's' },
    { type: 'speak_cue', cueId: 'toString' }, { type: 'modify_playback', stepIndex: 0, step: {} },
  ]) assert.equal(validateAgentReturn(response([action]), context).ok, false);
  assert.equal(validateAgentReturn(response([{ type: 'speak_text', text: 'Uncurated form judgment' }], 'form_event'), context).ok, false);
});

test('provider schema derives numeric parameter names and includes groups only with trusted policy', () => {
  const configured = JSON.stringify(createResponseSchema(catalog, true));
  assert.ok(configured.includes('fromDeg')); assert.ok(configured.includes('parallel'));
  assert.ok(configured.includes('stepIndex')); assert.equal(configured.includes('stepId'), false);
  assert.equal(configured.includes('speed'), false); assert.equal(configured.includes('side'), false);
  assert.equal(JSON.stringify(createResponseSchema(catalog, false)).includes('parallel'), false);
  assert.equal(JSON.stringify(createResponseSchema([], false)).includes('play_sequence'), false);
});

const playback: PlaybackState = { sequenceId: sequence.id, stepIndex: 0, phase: 'holding', status: 'playing', updatedAt: 1000 };
const event: FormEvent = { sequenceId: sequence.id, stepIndex: 0, checkId: 'b-check', status: 'needs_adjustment', observedAt: 1100, measurements: {} };
const decide = (e: FormEvent, state = emptyFeedbackState(), now = e.observedAt) =>
  decideFromFormEvent(e, playback, sequence, catalog, cues, state, now, checks);
const cue = (r: ReturnType<typeof decide>, cueId: string) => assert.deepEqual(r.result.actions, [{ type: 'speak_cue', cueId }]);
const silent = (r: ReturnType<typeof decide>) => assert.deepEqual(r.result.actions, [{ type: 'no_action' }]);

test('canonical vision events for any active group member route to cues without extra draft fields', () => {
  cue(decide(event), 'correct');
  cue(decide({ ...event, checkId: 'a-check' }), 'correct');
  silent(decide({ ...event, checkId: 'unconfigured' }));
  silent(decideFromFormEvent(event, playback, sequence, catalog, cues, emptyFeedbackState(), 1100));
  silent(decideFromFormEvent(event, { ...playback, phase: 'moving' }, sequence, catalog, cues, emptyFeedbackState(), 1100, checks));
});

test('feedback deduplicates and delays acknowledgment until cooldown without mutating state', () => {
  const initial = emptyFeedbackState();
  const correction = decide(event, initial); cue(correction, 'correct');
  assert.deepEqual(initial, emptyFeedbackState());
  silent(decide({ ...event, observedAt: 4000 }, correction.nextState));
  const early = decide({ ...event, status: 'aligned', observedAt: 2000 }, correction.nextState); silent(early);
  const late = decide({ ...event, status: 'aligned', observedAt: 4000 }, early.nextState); cue(late, 'improved');
  silent(decide({ ...event, status: 'aligned', observedAt: 7000 }, late.nextState));
});

test('not_observable never becomes alignment and stale/out-of-order/paused events do not speak', () => {
  const correction = decide(event);
  const loss = decide({ ...event, status: 'not_observable', observedAt: 4000 }, correction.nextState); cue(loss, 'position');
  assert.ok(Object.values(loss.nextState.lastStatusByCheck).includes('not_observable'));
  silent(decide(event, loss.nextState));
  silent(decide(event, emptyFeedbackState(), 5000));
  silent(decideFromFormEvent(event, { ...playback, status: 'paused' }, sequence, catalog, cues, emptyFeedbackState(), 1100, checks));
  silent(decideFromFormEvent({ ...event, status: 'aligned', observedAt: 5000 }, { ...playback, updatedAt: 4500 },
    sequence, catalog, cues, correction.nextState, 5000, checks));
});
