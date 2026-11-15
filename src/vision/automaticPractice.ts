import type { MovementSequence, PlaybackState, PoseObservation } from '../shared/contracts';
import type { AssessmentPlan } from '../shared/assessment';
import { assessmentCheckId } from '../shared/assessment';
import { readinessChecks } from './assessmentPlan';
import { assessMeasurements, measureAssessment } from './assessmentGeometry';

/** Readiness is evidence of a sustained starting pose, not merely a detected person. */
export class AutomaticPracticeDetector {
  private sequenceId: string | null = null;
  private first = 0;
  private last = 0;
  private frames = 0;
  update(sequence: MovementSequence | null, plan: AssessmentPlan | null, playback: PlaybackState | null,
    observation: PoseObservation | null, now: number): boolean {
    if (this.sequenceId !== sequence?.id) { this.reset(); this.sequenceId = sequence?.id ?? null; }
    if (!sequence || !plan?.checks.length || plan.sequenceId !== sequence.id || playback?.sequenceId !== sequence.id ||
      playback.status !== 'completed' || !observation || !Number.isFinite(now) || !Number.isFinite(observation.observedAt) ||
      now - observation.observedAt > 700 || observation.observedAt > now + 100 ||
      observation.observedAt < playback.updatedAt) { this.clear(); return false; }
    if (observation.observedAt <= this.last) return false;
    const checks = readinessChecks(sequence);
    const measurements = Object.fromEntries(checks.map(check => [assessmentCheckId(check), measureAssessment(observation, check.side, check.metric)]));
    if (assessMeasurements(checks, measurements).status !== 'aligned') { this.clear(); return false; }
    if (this.last === 0 || observation.observedAt - this.last > 500) { this.first = observation.observedAt; this.frames = 0; }
    this.last = observation.observedAt; this.frames++;
    if (this.frames >= 4 && this.last - this.first >= 800) { this.clear(); return true; }
    return false;
  }
  reset() { this.sequenceId = null; this.clear(); }
  private clear() { this.first = 0; this.last = 0; this.frames = 0; }
}
