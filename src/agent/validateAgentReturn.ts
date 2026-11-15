import type { ComponentDefinition, MovementSequence } from '../shared/contracts';
import type { AgentAction, AgentReturn } from './types';
import { validateSequence, type CompositionPolicy } from '../shared/validateSequence';
import { hasOnlyKeys, isId, isRecord } from '../shared/validation';

export type AgentValidation = { ok: true; value: AgentReturn } | { ok: false; error: string };
export type AgentValidationContext = {
  catalog: readonly ComponentDefinition[];
  cues: Readonly<Record<string, string>>;
  currentSequence: MovementSequence | null;
  compositionPolicy?: CompositionPolicy;
};

/** Validate the entire action batch before dispatch; never execute a valid prefix of an invalid batch. */
export function validateAgentReturn(input: unknown, context: AgentValidationContext): AgentValidation {
  const fail = (error: string): AgentValidation => ({ ok: false, error });
  if (!isRecord(input) || !isId(input.decisionId) || !hasOnlyKeys(input, ['decisionId', 'trigger', 'actions']) ||
    !isRecord(input.trigger) || !hasOnlyKeys(input.trigger, ['type', 'id']) || !isId(input.trigger.id) ||
    (input.trigger.type !== 'user_utterance' && input.trigger.type !== 'form_event') ||
    !Array.isArray(input.actions) || input.actions.length < 1 || input.actions.length > 16) {
    return fail('Invalid agent return.');
  }
  let sequence = context.currentSequence;
  const actions: AgentAction[] = [];
  for (const action of input.actions) {
    if (!isRecord(action)) return fail('Invalid action.');
    switch (action.type) {
      case 'play_sequence': {
        if (!hasOnlyKeys(action, ['type', 'sequence'])) return fail('Unexpected action fields.');
        const checked = validateSequence(action.sequence, context.catalog, context.compositionPolicy);
        if (!checked.ok) return checked;
        sequence = checked.sequence;
        actions.push({ type: action.type, sequence });
        break;
      }
      case 'modify_playback': {
        if (!hasOnlyKeys(action, ['type', 'stepIndex', 'step']) || !sequence ||
          typeof action.stepIndex !== 'number' || !Number.isInteger(action.stepIndex) ||
          action.stepIndex < 0 || action.stepIndex >= sequence.steps.length) return fail('Invalid modification stepIndex.');
        const stepIndex = action.stepIndex;
        const checked = validateSequence({ ...sequence, steps: sequence.steps.map((step, index) =>
          index === stepIndex ? action.step : step) }, context.catalog, context.compositionPolicy);
        if (!checked.ok) return checked;
        sequence = checked.sequence;
        actions.push({ type: action.type, stepIndex, step: sequence.steps[stepIndex] });
        break;
      }
      case 'replay_demonstration':
        if (!hasOnlyKeys(action, ['type', 'stepIndex']) || typeof action.stepIndex !== 'number' ||
          !Number.isInteger(action.stepIndex) || action.stepIndex < 0 || !sequence ||
          action.stepIndex >= sequence.steps.length ||
          !validateSequence(sequence, context.catalog, context.compositionPolicy).ok) return fail('Unknown or unsupported replay step.');
        actions.push({ type: action.type, stepIndex: action.stepIndex });
        break;
      case 'speak_cue':
        if (!hasOnlyKeys(action, ['type', 'cueId']) || !isId(action.cueId) ||
          !Object.hasOwn(context.cues, action.cueId) || !context.cues[action.cueId]?.trim()) return fail('Unknown cue.');
        actions.push({ type: action.type, cueId: action.cueId });
        break;
      case 'speak_text':
        if (!hasOnlyKeys(action, ['type', 'text']) || typeof action.text !== 'string' ||
          !action.text.trim() || action.text.length > 4000 || input.trigger.type === 'form_event') {
          return fail('Invalid conversational text; form feedback must use curated cues.');
        }
        actions.push({ type: action.type, text: action.text });
        break;
      case 'pause_session':
      case 'stop_session':
        if (!hasOnlyKeys(action, ['type', 'reason']) ||
          (action.reason !== 'user_request' && action.reason !== 'safety')) return fail('Invalid session control.');
        actions.push({ type: action.type, reason: action.reason });
        if (action.type === 'stop_session') sequence = null;
        break;
      case 'no_action':
        if (!hasOnlyKeys(action, ['type']) || input.actions.length !== 1) return fail('no_action must stand alone.');
        actions.push({ type: 'no_action' });
        break;
      default: return fail('Unsupported agent action.');
    }
  }
  return { ok: true, value: { decisionId: input.decisionId,
    trigger: { type: input.trigger.type, id: input.trigger.id }, actions } };
}
