import type { ComponentDefinition, FormEvent, MovementSequence, PlaybackState } from './contracts';
import { getStepCommands } from './movementSteps';

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
  const commands = step ? getStepCommands(step) : [];
  // A group retains one stepIndex, so feedback from every configured member
  // remains associated with the same playback phase/freshness boundary.
  const supportsCheck = commands.some((command) => catalog.some((entry) => entry.id === command.componentId && entry.supportedCheckIds.includes(event.checkId)));
  return Boolean(
    supportsCheck && playback.status === 'playing' && playback.phase !== 'completed' &&
    sequence.id === playback.sequenceId && event.sequenceId === sequence.id &&
    event.stepIndex === playback.stepIndex &&
    Number.isFinite(event.observedAt) && event.observedAt >= playback.updatedAt &&
    event.observedAt <= now && now - event.observedAt <= maximumAgeMs,
  );
}
