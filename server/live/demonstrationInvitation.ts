import type { MovementSequence, PlaybackState } from '../../src/shared/contracts';
import type { AssessmentPlan } from '../../src/shared/assessment';

export const PRACTICE_INVITATION = 'Now try the movement yourself. Start in the opening position, and I’ll help you match it.';

/** Initial demonstrations invite once; camera/context updates and practice replays do not. */
export class DemonstrationInvitation {
  private invited = new Set<string>();
  take(sequence: MovementSequence | null, plan: AssessmentPlan | null, playback: PlaybackState | null,
    practiceStartedAt: number | null, busy: boolean, now: number): string | null {
    if (busy || !sequence || plan?.sequenceId !== sequence.id || !plan.checks.length || practiceStartedAt !== null ||
      playback?.sequenceId !== sequence.id || playback.phase !== 'completed' || playback.status !== 'completed' ||
      playback.stepIndex !== sequence.steps.length - 1 || !Number.isFinite(playback.updatedAt) ||
      playback.updatedAt > now + 1000 || now - playback.updatedAt > 60_000 || this.invited.has(sequence.id)) return null;
    this.invited.add(sequence.id);
    return PRACTICE_INVITATION;
  }
}
