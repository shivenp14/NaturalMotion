import type { FormEvent } from '../shared/contracts';

export type FormStatus = FormEvent['status'];

/**
 * Stops one noisy frame from changing what the user is told.
 *
 * A status must be seen on `minimumFrames` consecutive observations before it is reported. The
 * stabilizer keeps reporting the last stable status while the input is still moving, so the UI
 * does not flicker, and it drops everything after a stall longer than `maximumGapMs` because the
 * old status no longer describes the current body position.
 */
export class StatusStabilizer {
  private candidate: FormStatus | null = null;
  private candidateCount = 0;
  private stable: FormStatus | null = null;
  private lastObservedAt = 0;

  constructor(
    private readonly minimumFrames: number = 4,
    private readonly maximumGapMs: number = 1_000,
  ) {}

  update(status: FormStatus, observedAt: number): FormStatus | null {
    if (this.lastObservedAt > 0 && observedAt - this.lastObservedAt > this.maximumGapMs) {
      this.reset();
    }
    this.lastObservedAt = observedAt;

    if (status === this.candidate) {
      this.candidateCount += 1;
    } else {
      this.candidate = status;
      this.candidateCount = 1;
    }
    if (this.candidateCount >= this.minimumFrames) this.stable = status;
    return this.stable;
  }

  reset(): void {
    this.candidate = null;
    this.candidateCount = 0;
    this.stable = null;
    this.lastObservedAt = 0;
  }
}
