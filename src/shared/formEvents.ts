import type { ComponentDefinition, FormEvent, MovementSequence, PlaybackState } from './contracts';

/** Gate feedback by the active sequence, step, phase, and supported checks. */
export function isCurrentFormEvent(
  event: FormEvent,
  playback: PlaybackState,
  sequence: MovementSequence,
  catalog: readonly ComponentDefinition[],
  now: number,
  maximumAgeMs: number,
): boolean {
  const step = sequence.steps[playback.stepIndex];
  const component = catalog.find((entry) => entry.id === step?.componentId);
  return Boolean(
    component && playback.status === 'playing' && playback.phase !== 'completed' &&
    sequence.id === playback.sequenceId && event.sequenceId === sequence.id &&
    event.stepIndex === playback.stepIndex && component.supportedCheckIds.includes(event.checkId) &&
    Number.isFinite(event.observedAt) && event.observedAt >= playback.updatedAt &&
    event.observedAt <= now && now - event.observedAt <= maximumAgeMs,
  );
}
