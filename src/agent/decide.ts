import type { ComponentDefinition, FormEvent, MovementSequence, PlaybackState } from '../shared/contracts';
import { isCurrentFormEvent } from '../shared/formEvents';
import { getStepCommands } from '../shared/movementSteps';
import type { AgentReturn, CheckFeedbackDefinition, FeedbackState } from './types';

export const emptyFeedbackState = (): FeedbackState => ({
  lastStatusByCheck: {}, correctionPendingByCheck: {}, lastCueTimeByCheck: {},
  lastObservationByCheck: {}, lastSpokenStatusByCheck: {},
});

/** Vision owns stability/visibility; canonical FormEvent.status already expresses unobservability. */
export function decideFromFormEvent(
  event: FormEvent, playback: PlaybackState, sequence: MovementSequence,
  catalog: readonly ComponentDefinition[], cues: Readonly<Record<string, string>>,
  state: FeedbackState, nowMs = Date.now(), checks: readonly CheckFeedbackDefinition[] = [],
): { result: AgentReturn; nextState: FeedbackState } {
  const result: AgentReturn = { decisionId: `feedback-${event.observedAt}`,
    trigger: { type: 'form_event', id: JSON.stringify([event.sequenceId, event.stepIndex, event.checkId, event.observedAt]) },
    actions: [{ type: 'no_action' }] };
  const contextKey = JSON.stringify([playback.sequenceId, playback.stepIndex, playback.phase, playback.status, playback.updatedAt]);
  const base = state.contextKey === contextKey ? state : emptyFeedbackState();
  const nextState: FeedbackState = { contextKey,
    lastStatusByCheck: { ...base.lastStatusByCheck },
    correctionPendingByCheck: { ...base.correctionPendingByCheck },
    lastCueTimeByCheck: { ...base.lastCueTimeByCheck },
    lastObservationByCheck: { ...base.lastObservationByCheck },
    lastSpokenStatusByCheck: { ...base.lastSpokenStatusByCheck },
  };
  if (!Number.isFinite(nowMs) || !Number.isFinite(playback.updatedAt) ||
    !Number.isInteger(playback.stepIndex) || playback.stepIndex < 0 ||
    !['needs_adjustment', 'aligned', 'not_observable'].includes(event.status) ||
    !isCurrentFormEvent(event, playback, sequence, catalog, nowMs, 2000)) return { result, nextState };
  const commands = getStepCommands(sequence.steps[playback.stepIndex]);
  const check = checks.find(entry => entry.checkId === event.checkId && entry.phases.includes(playback.phase) &&
    commands.some(command => command.componentId === entry.componentId &&
      catalog.some(component => component.id === command.componentId && component.supportedCheckIds.includes(event.checkId))));
  if (!check) return { result, nextState };
  const key = JSON.stringify([event.sequenceId, event.stepIndex, event.checkId]);
  if (event.observedAt <= (base.lastObservationByCheck[key] ?? -Infinity)) return { result, nextState };
  nextState.lastObservationByCheck[key] = event.observedAt;
  const status = event.status;
  nextState.lastStatusByCheck[key] = status;
  if (status === 'needs_adjustment') nextState.correctionPendingByCheck[key] = true;
  let cueId: string | undefined;
  if (status === 'not_observable' && base.lastSpokenStatusByCheck[key] !== status) cueId = check.repositionCueId;
  if (status === 'needs_adjustment' && base.lastSpokenStatusByCheck[key] !== status) cueId = check.correctionCueId;
  if (status === 'aligned' && nextState.correctionPendingByCheck[key]) cueId = check.acknowledgmentCueId;
  if (!cueId || nowMs - (base.lastCueTimeByCheck[key] ?? -Infinity) < 2500 ||
    !Object.hasOwn(cues, cueId) || !cues[cueId]?.trim()) return { result, nextState };
  nextState.lastCueTimeByCheck[key] = nowMs;
  nextState.lastSpokenStatusByCheck[key] = status;
  if (status === 'aligned') nextState.correctionPendingByCheck[key] = false;
  result.actions = [{ type: 'speak_cue', cueId }];
  return { result, nextState };
}
