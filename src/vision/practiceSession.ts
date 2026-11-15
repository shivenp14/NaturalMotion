import type { MovementSequence, PlaybackState, PoseObservation } from '../shared/contracts';
import type { AssessmentPlan } from '../shared/assessment';
import { AutomaticPracticeDetector } from './automaticPractice';

export type PracticeSnapshot = { sequence: MovementSequence | null; playback: PlaybackState | null; startedAt: number | null };

/** Replay has its own render identity; assessment and backend keep the canonical source identity. */
export class PracticeSession {
  private source: MovementSequence | null = null;
  private counter = 0;
  private detector = new AutomaticPracticeDetector();
  private view: PracticeSnapshot = { sequence: null, playback: null, startedAt: null };
  get snapshot() { return this.view; }
  update(sequence: MovementSequence | null, plan: AssessmentPlan | null, demonstration: PlaybackState | null,
    observation: PoseObservation | null, now: number): PracticeSnapshot {
    if (sequence !== this.source) { this.reset(); this.source = sequence; }
    if (!this.view.sequence && sequence && this.detector.update(sequence, plan, demonstration, observation, now)) {
      const replay = { id: `${sequence.id.slice(0, 90)}:practice:${++this.counter}`, steps: sequence.steps };
      this.view = { sequence: replay, startedAt: now, playback: { sequenceId: sequence.id, stepIndex: 0, phase: 'preparing', status: 'playing', updatedAt: now } };
    }
    return this.view;
  }
  recordPlayback(value: PlaybackState): boolean {
    if (!this.view.sequence || !this.source || value.sequenceId !== this.view.sequence.id) return false;
    this.view = { ...this.view, playback: { ...value, sequenceId: this.source.id } };
    return true;
  }
  reset() {
    this.source = null; this.detector.reset();
    if (this.view.sequence || this.view.startedAt !== null) this.view = { sequence: null, playback: null, startedAt: null };
  }
}
