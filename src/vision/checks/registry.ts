import type { ComponentDefinition, MovementSequence, PlaybackState, PoseObservation } from '../../shared/contracts';
import type { FormReport } from '../../live/protocol';
import { compileUpperBodySequence, upperBodyPreviewCatalog } from '../../anatomy/upperBodySequence';
import { REQUIRED_GOALPOST_JOINTS } from '../metrics';
import { StatusStabilizer } from '../stability';
import { evaluateGoalpostArms, GOALPOST_ARMS_CHECK_ID } from './goalpostArms';
import { getStepCommands } from '../../shared/movementSteps';

/** A check capability is conditional; the per-sequence plan below determines when it applies. */
export const coachingCatalog: readonly ComponentDefinition[] = upperBodyPreviewCatalog.map(component =>
  component.id.endsWith('shoulder_elevation') ? { ...component, cameraView: 'front',
    requiredLandmarks: REQUIRED_GOALPOST_JOINTS, supportedCheckIds: [GOALPOST_ARMS_CHECK_ID] } : component);

/** Reuse the verified goalpost check only for stationary bilateral goalpost holds. */
export function deriveFormPlan(sequence: MovementSequence): ReadonlyMap<number, string> {
  const program = compileUpperBodySequence(sequence);
  const plan = new Map<number, string>();
  program.segments.forEach((segment, index) => {
    const goalpost = [segment.to.left, segment.to.right].every(arm =>
      Math.abs(arm.elevationDeg - 90) < 0.0001 && Math.abs(arm.elbowFlexionDeg - 90) < 0.0001 &&
      Math.abs(arm.externalRotationDeg - 90) < 0.0001);
    const hasShoulderCommand = getStepCommands(sequence.steps[index]).some(command => command.componentId.endsWith('shoulder_elevation'));
    if (goalpost && hasShoulderCommand) plan.set(index, GOALPOST_ARMS_CHECK_ID);
  });
  return plan;
}

export function formMessage(status: FormReport['status']): string {
  switch (status) {
    case 'aligned': return 'Elbow height and spread match the goalpost check.';
    case 'needs_adjustment': return 'Keep your elbows around shoulder height and spread outward for the goalpost hold.';
    case 'not_observable': return 'The goalpost check cannot currently see enough reliable pose data.';
    case 'unavailable': return 'No verified form check is available for this movement phase.';
  }
}

export class SequenceFormEvaluator {
  private sequence: MovementSequence | null = null;
  private plan: ReadonlyMap<number, string> = new Map();
  private context = '';
  private stabilizer = new StatusStabilizer();
  private lastObservationAt = 0;
  private stableStatus: FormReport['status'] = 'not_observable';
  evaluate(sequence: MovementSequence | null, playback: PlaybackState | null,
    observation: PoseObservation | null, now: number, practiceStartedAt: number | null = null): FormReport | null {
    if (!sequence || !playback || playback.sequenceId !== sequence.id) { this.reset(); return null; }
    if (sequence !== this.sequence) { this.sequence = sequence; this.plan = deriveFormPlan(sequence); }
    // Practice is an explicit following state after playback, not a renderer phase report.
    const practice = practiceStartedAt !== null && playback.status === 'completed' &&
      playback.stepIndex === sequence.steps.length - 1 && this.plan.has(playback.stepIndex);
    if (practice) playback = { ...playback, phase: 'holding', status: 'playing', updatedAt: practiceStartedAt! };
    const context = JSON.stringify([sequence.id, playback.stepIndex, playback.phase, playback.status, playback.updatedAt]);
    if (context !== this.context) { this.context = context; this.stabilizer.reset(); this.lastObservationAt = 0; this.stableStatus = 'not_observable'; }
    const checkId = this.plan.get(playback.stepIndex) ?? null;
    let status: FormReport['status'] = 'unavailable';
    if (checkId && playback.phase === 'holding' && playback.status === 'playing') {
      status = 'not_observable';
      if (observation && now - observation.observedAt <= 1000 && observation.observedAt <= now + 100 &&
        observation.observedAt >= playback.updatedAt) {
        const event = evaluateGoalpostArms(observation, playback);
        if (event && observation.observedAt > this.lastObservationAt) {
          this.lastObservationAt = observation.observedAt;
          this.stableStatus = this.stabilizer.update(event.status, observation.observedAt) ?? 'not_observable';
        }
        status = this.stableStatus;
      } else this.stabilizer.reset();
    }
    return { sequenceId: sequence.id, stepIndex: playback.stepIndex, checkId,
      mode: practice ? 'practice' : 'demonstration', status,
      observedAt: status === 'aligned' || status === 'needs_adjustment' ? observation!.observedAt : now,
      message: formMessage(status) };
  }
  reset() { this.sequence = null; this.plan = new Map(); this.context = ''; this.stabilizer.reset(); this.lastObservationAt = 0; this.stableStatus = 'not_observable'; }
}
