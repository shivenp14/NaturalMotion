import type { AgentReturn, FormEvent, PlaybackState } from './contracts';
import { defaultStep, validateSequence } from './catalog';
import { decideFromFormEvent, emptyFeedbackState } from './decide';

const sequence = { sequenceId: 'seq_demo_1', steps: [defaultStep()] };
const checked = validateSequence(sequence);
if (!checked.valid) throw new Error(checked.errors.join(', '));

// 1. Response to a spoken request: User: "Show me a gentle stretch."
const initialAgentReturn: AgentReturn = {
  decisionId: 'd_user_1',
  trigger: { type: 'user_utterance', id: 'utterance_1' },
  actions: [{ type: 'speak_cue', cueId: 'introduction' }, { type: 'play_sequence', sequence }],
};

const playback: PlaybackState = { sequenceId: sequence.sequenceId, stepId: 'step_1', phase: 'observing', updatedAtMs: 1000 };
let feedback = emptyFeedbackState();
const issue: FormEvent = {
  eventId: 'vision_001', sequenceId: sequence.sequenceId, stepId: 'step_1', checkId: 'torso_alignment',
  status: 'needs_adjustment', observedAtMs: 2000, stable: true, visibilityOk: true,
  measurement: { name: 'torso_tilt', value: 16.2, unit: 'degrees' }, direction: 'right',
};
const correction = decideFromFormEvent(issue, playback, feedback, 3000);
feedback = correction.nextState;
const improved: FormEvent = { ...issue, eventId: 'vision_002', status: 'aligned', observedAtMs: 7000 };
const acknowledgment = decideFromFormEvent(improved, playback, feedback, 7500);

// 2. Later spoken request: "Can you slow it down?"
const modifyAgentReturn: AgentReturn = {
  decisionId: 'd_user_2',
  trigger: { type: 'user_utterance', id: 'utterance_2' },
  actions: [{ type: 'modify_playback', stepId: 'step_1', parameters: { speed: 'slow' } }],
};

console.log(JSON.stringify({ initialAgentReturn, correction: correction.result, acknowledgment: acknowledgment.result, modifyAgentReturn }, null, 2));
