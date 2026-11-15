import type { MovementSequence, PlaybackState, PoseObservation } from '../shared/contracts';
import type { AssessmentPlan } from '../shared/assessment';
import { assessmentCheckId } from '../shared/assessment';
import type { FormReport } from '../live/protocol';
import { currentAssessmentChecks } from './assessmentPlan';
import { assessMeasurements, assessmentMessage, measureAssessment } from './assessmentGeometry';

export function evaluateAdaptiveForm(sequence: MovementSequence | null, plan: AssessmentPlan | null,
  playback: PlaybackState | null, observation: PoseObservation | null, now: number, practiceStartedAt: number | null): FormReport | null {
  if (!sequence || !playback || playback.sequenceId !== sequence.id) return null;
  const practice = practiceStartedAt !== null;
  const phaseStart = playback.updatedAt - (playback.phaseElapsedSeconds ?? 0) * 1000;
  const fresh = observation && Number.isFinite(now) && Number.isFinite(observation.observedAt) && now - observation.observedAt <= 700 && observation.observedAt <= now + 100 &&
    observation.observedAt >= Math.max(phaseStart, practiceStartedAt ?? 0);
  const checks = plan && practice ? currentAssessmentChecks(plan, sequence, playback, fresh ? observation!.observedAt : now) : [];
  const measurements = Object.fromEntries(checks.map(check => [assessmentCheckId(check), fresh ? measureAssessment(observation!, check.side, check.metric) : null]));
  const result = assessMeasurements(checks, measurements);
  return { sequenceId: sequence.id, stepIndex: playback.stepIndex,
    observedAt: fresh ? observation!.observedAt : now,
    mode: practice ? 'practice' : 'demonstration', ...result, measurements,
    message: !practice && plan?.checks.length ? 'Watch the demonstration. Hold its starting arm position when you are ready to follow along.' :
      result.status === 'unavailable' ? assessmentMessage('unavailable') : result.message };
}
