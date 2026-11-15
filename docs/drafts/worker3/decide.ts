import type { AgentReturn, FeedbackState, FormEvent, PlaybackState } from './contracts';
import { MOVEMENT_CATALOG } from './catalog';

export const emptyFeedbackState = (): FeedbackState => ({
  lastStatusByCheck: {}, correctionPendingByCheck: {}, lastCueTimeByCheck: {},
});

/**
 * Deterministic handling for camera form events.
 * Worker 1 owns geometry, stability/thresholds; Worker 3 owns response routing.
 * Agent/LLM can add grounded conversational explanations, but not invent form judgments.
 */
export function decideFromFormEvent(
  event: FormEvent,
  playback: PlaybackState,
  state: FeedbackState,
  nowMs = Date.now(),
): { result: AgentReturn; nextState: FeedbackState } {
  const none: AgentReturn = { decisionId: `decision_${event.eventId}`, trigger: { type: 'form_event', id: event.eventId }, actions: [{ type: 'no_action' }] };
  const nextState: FeedbackState = {
    lastStatusByCheck: { ...state.lastStatusByCheck },
    correctionPendingByCheck: { ...state.correctionPendingByCheck },
    lastCueTimeByCheck: { ...state.lastCueTimeByCheck },
  };
  if (event.sequenceId !== playback.sequenceId || event.stepId !== playback.stepId || playback.phase !== 'observing') return { result: none, nextState };
  const component = Object.values(MOVEMENT_CATALOG).find(c => c.enabled && c.formChecks.some(check => check.checkId === event.checkId));
  const check = component?.formChecks.find(c => c.checkId === event.checkId);
  if (!check || !event.stable) return { result: none, nextState };

  const key = `${event.sequenceId}:${event.stepId}:${event.checkId}`;
  const before = state.lastStatusByCheck[key];
  const cooldownMs = 2500; // demo throttle, tune on device
  const lastCueMs = state.lastCueTimeByCheck[key] ?? -Infinity;
  const after: FeedbackState = nextState;
  after.lastStatusByCheck[key] = event.status;

  let cueId: string | undefined;
  if (event.status === 'not_observable' || !event.visibilityOk) {
    // Vision loss can never be treated as correct form.
    if (before !== 'not_observable' && nowMs - lastCueMs >= cooldownMs) cueId = check.repositionCueId;
    after.lastStatusByCheck[key] = 'not_observable';
  } else if (event.status === 'needs_adjustment') {
    after.correctionPendingByCheck[key] = true;
    if (before !== 'needs_adjustment' && nowMs - lastCueMs >= cooldownMs) cueId = check.correctionCueId;
  } else if (event.status === 'aligned' && state.correctionPendingByCheck[key]) {
    after.correctionPendingByCheck[key] = false;
    if (nowMs - lastCueMs >= cooldownMs) cueId = check.acknowledgmentCueId;
  }
  if (!cueId) return { result: none, nextState: after };
  after.lastCueTimeByCheck[key] = nowMs;
  return {
    result: { decisionId: `decision_${event.eventId}`, trigger: { type: 'form_event', id: event.eventId }, actions: [{ type: 'speak_cue', cueId }] },
    nextState: after,
  };
}
