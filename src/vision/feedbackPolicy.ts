import type { FormReport } from '../live/protocol';

type Candidate = {
  key: string;
  firstObservedAt: number;
  firstReceivedAt: number;
  frames: number;
};

const EVIDENCE_MS = { needs_adjustment: 800, aligned: 1200, not_observable: 2000 } as const;
const COOLDOWN_MS = 4000;
const MAXIMUM_GAP_MS = 1000;

/** Speech scheduling only. Never delay a visual loss-of-visibility assessment. */
export class FeedbackSpeechPolicy {
  private context: string | null = null;
  private candidate: Candidate | null = null;
  private lastObservedAt: number | null = null;
  private lastReceivedAt: number | null = null;
  private lastSpokenAt: number | null = null;
  private lastSpokenKey: string | null = null;

  shouldSpeak(report: FormReport | null, now: number): boolean {
    if (!Number.isFinite(now)) { this.clearCandidate(); return false; }
    if (this.lastReceivedAt !== null && now < this.lastReceivedAt) {
      this.clearCandidate();
      return false;
    }
    this.lastReceivedAt = now;
    if (!report || report.mode !== 'practice' || report.status === 'unavailable' || !report.checkId) {
      this.context = null; this.lastSpokenKey = null; this.clearCandidate();
      return false;
    }
    if (!Number.isFinite(report.observedAt) || now - report.observedAt > 1000 || report.observedAt > now + 100) {
      this.clearCandidate();
      return false;
    }
    const context = JSON.stringify([report.sequenceId, report.stepIndex]);
    if (context !== this.context) {
      this.context = context; this.lastSpokenKey = null; this.clearCandidate();
    }
    // A watchdog can call repeatedly with the same pose; those calls must not
    // turn one observation into persistent evidence or release a delayed cue.
    if (this.lastObservedAt !== null && report.observedAt <= this.lastObservedAt) {
      if (report.observedAt < this.lastObservedAt) this.clearCandidate();
      return false;
    }
    const gap = this.lastObservedAt === null ? 0 : report.observedAt - this.lastObservedAt;
    this.lastObservedAt = report.observedAt;
    const key = JSON.stringify([report.status, report.checkId, report.message]);
    if (!this.candidate || this.candidate.key !== key || gap > MAXIMUM_GAP_MS) {
      this.candidate = { key, firstObservedAt: report.observedAt, firstReceivedAt: now, frames: 1 };
      return false;
    }
    this.candidate.frames++;
    const elapsed = Math.min(report.observedAt - this.candidate.firstObservedAt, now - this.candidate.firstReceivedAt);
    if (this.candidate.frames < 3 || elapsed < EVIDENCE_MS[report.status] || key === this.lastSpokenKey ||
      (this.lastSpokenAt !== null && now - this.lastSpokenAt < COOLDOWN_MS)) return false;
    this.lastSpokenAt = now; this.lastSpokenKey = key;
    return true;
  }

  /** End/restart of the actual session, rather than a step or status change. */
  reset(): void {
    this.context = null; this.lastSpokenKey = null; this.lastSpokenAt = null;
    this.lastReceivedAt = null; this.clearCandidate();
  }

  private clearCandidate(): void { this.candidate = null; this.lastObservedAt = null; }
}
