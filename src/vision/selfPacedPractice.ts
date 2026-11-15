import type { MovementSequence, PlaybackState, PoseObservation } from '../shared/contracts';
import { ASSESSMENT_METRICS, type AssessmentPlan } from '../shared/assessment';
import type { PracticeAttempt, PracticeReview, PracticeSample } from '../shared/practice';
import { measureAssessment } from './assessmentGeometry';
import { reviewPracticeAttempt } from './repetitionTracker';

export type SelfPacedSnapshot = {
  stage: 'watching' | 'ready' | 'performing' | 'review';
  recordingId: string | null; startedAt: number | null;
  attempt: PracticeAttempt | null; review: PracticeReview | null; message: string;
};
const empty = (): SelfPacedSnapshot => ({ stage: 'watching', recordingId: null, startedAt: null,
  attempt: null, review: null, message: 'Watch the demonstration first.' });

/** Record quietly after the demonstration. Only the user's finish cue ends an attempt. */
export class SelfPacedPractice {
  private source: MovementSequence | null = null;
  private plan: AssessmentPlan | null = null;
  private counter = 0;
  private requested = false;
  private samples: PracticeSample[] = [];
  private lastObservationAt = 0;
  private previousReview: PracticeReview | null = null;
  private truncated = false;
  private view = empty();
  get snapshot() { return this.view; }
  requestStart() { if (this.view.stage !== 'performing') this.requested = true; }
  finish(now: number) {
    if (!this.source || this.view.stage !== 'performing') return;
    // An overlong/full buffer is insufficient evidence, never an automatic review or success.
    const expired = this.truncated || now - this.view.startedAt! > 120_000;
    const attempt: PracticeAttempt = { sequenceId: this.source.id, attemptId: this.view.recordingId!,
      startedAt: Math.max(this.view.startedAt!, now - 120_000), endedAt: now, samples: expired ? [] : [...this.samples] };
    const review = reviewPracticeAttempt(this.source, this.plan, attempt, this.previousReview);
    this.previousReview = review;
    this.view = { ...this.view, stage: 'review', attempt, review, message: review.message };
  }
  update(sequence: MovementSequence | null, plan: AssessmentPlan | null, demonstration: PlaybackState | null,
    observation: PoseObservation | null, now: number, paused = false): SelfPacedSnapshot {
    if (sequence !== this.source) { this.reset(); this.source = sequence; this.plan = plan; }
    if (!sequence || !plan?.checks.length || plan.sequenceId !== sequence.id || demonstration?.sequenceId !== sequence.id || demonstration.status !== 'completed') return this.view;
    if (paused) return this.view;
    if (this.view.stage === 'watching' || (this.view.stage === 'review' && this.requested)) this.begin(now);
    if (this.view.stage !== 'performing') return this.view;
    if (!this.truncated && (now - this.view.startedAt! > 120_000 || this.samples.length >= 900)) {
      this.truncated = true; this.samples = [];
      this.view = { ...this.view, message: 'This recording ran too long to review reliably. Say “I’m done,” then ask to try again.' };
    }
    const fresh = observation && Number.isFinite(observation.observedAt) && observation.observedAt > this.lastObservationAt &&
      now - observation.observedAt <= 700 && observation.observedAt <= now + 100 && observation.observedAt >= this.view.startedAt!;
    if (fresh) {
      this.lastObservationAt = observation.observedAt;
      // Bound capture to 10 Hz so a native high-rate camera cannot exhaust the buffer immediately.
      if (!this.truncated && (!this.samples.length || observation.observedAt - this.samples.at(-1)!.observedAt >= 100)) {
        this.samples.push({ observedAt: observation.observedAt, measurements: Object.fromEntries((['left', 'right'] as const).flatMap(side =>
          ASSESSMENT_METRICS.map(metric => [`${side}_${metric}`, measureAssessment(observation, side, metric)]))) });
      }
    }
    return this.view;
  }
  private begin(now: number) {
    if (!this.source) return;
    this.requested = false; this.samples = []; this.truncated = false;
    this.view = { stage: 'performing', recordingId: `${this.source.id.slice(0, 80)}:attempt:${++this.counter}`,
      startedAt: now, attempt: null, review: null,
      message: 'Move at your own pace. Say “I’m done” when you finish, and I’ll review your form.' };
  }
  reset() {
    this.source = null; this.plan = null; this.requested = false; this.samples = []; this.truncated = false;
    this.lastObservationAt = 0; this.previousReview = null; this.view = empty();
  }
}
