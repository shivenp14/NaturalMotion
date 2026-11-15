import type { FormEvent, PlaybackState, PoseObservation } from '../../shared/contracts';
import { computeUpperBodyMetrics, unobservableJoints } from '../metrics';

/**
 * Check id for the goalpost arm raise: are both elbows held at or above the shoulder line, and
 * open wide enough? This id is what `ComponentDefinition.supportedCheckIds` will list.
 */
export const GOALPOST_ARMS_CHECK_ID = 'goalpost_arms_elbow_height';

export type GoalpostThresholds = {
  /** Shoulder widths an elbow may sit below the shoulder line before it counts as dropped. */
  minimumElbowAboveShoulder: number;
  /** Shoulder widths the elbow must sit outside its own shoulder. */
  minimumElbowSpread: number;
};

/**
 * Starting values, calibrated for a front camera at roughly 1.5–2 m. These are not clinical
 * thresholds; they are tuned on the presentation phone during the spike.
 */
export const DEFAULT_GOALPOST_THRESHOLDS: GoalpostThresholds = {
  minimumElbowAboveShoulder: -0.15,
  minimumElbowSpread: 0.25,
};

const ACTIVE_PHASES: ReadonlySet<PlaybackState['phase']> = new Set(['moving', 'holding']);

/**
 * Goalpost arm raise evaluator.
 *
 * Returns null when the playback state means the check does not apply, so a stale step cannot
 * produce feedback. Missing or low-visibility landmarks produce `not_observable`, which callers
 * must never treat as correct form.
 */
export function evaluateGoalpostArms(
  observation: PoseObservation,
  playback: PlaybackState,
  thresholds: GoalpostThresholds = DEFAULT_GOALPOST_THRESHOLDS,
): FormEvent | null {
  if (playback.status !== 'playing' || !ACTIVE_PHASES.has(playback.phase)) return null;
  // An observation from before this step or phase started cannot describe what the user is doing
  // now, so it must not produce feedback.
  if (observation.observedAt < playback.updatedAt) return null;

  const event = {
    sequenceId: playback.sequenceId,
    stepIndex: playback.stepIndex,
    checkId: GOALPOST_ARMS_CHECK_ID,
    observedAt: observation.observedAt,
  };

  const missing = unobservableJoints(observation);
  const metrics = computeUpperBodyMetrics(observation);
  if (!metrics) {
    return {
      ...event,
      status: 'not_observable',
      measurements: { missingLandmarks: missing.length },
    };
  }

  const needsAdjustment =
    metrics.elbowAboveShoulder < thresholds.minimumElbowAboveShoulder ||
    metrics.elbowSpread < thresholds.minimumElbowSpread;

  return {
    ...event,
    status: needsAdjustment ? 'needs_adjustment' : 'aligned',
    measurements: { ...metrics },
  };
}
