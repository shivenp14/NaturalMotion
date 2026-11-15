import type { MovementSequence, PlaybackState } from '../shared/contracts';
import type { AssessmentPlan } from '../shared/assessment';
import type { AvatarViewPreference, PresentationPlan } from '../shared/presentation';
import type { PracticeAttempt, PracticeReview } from '../shared/practice';

export type LiveControl = 'pause_movement' | 'resume_movement' | 'stop_movement';
export type LiveAction = { type: 'play_sequence'; sequence: MovementSequence; assessmentPlan?: AssessmentPlan | null; presentationPlan?: PresentationPlan | null } |
  { type: 'set_avatar_view'; view: AvatarViewPreference } | { type: 'start_practice' | 'finish_practice' } | { type: LiveControl };
export type FormReport = {
  sequenceId: string; stepIndex: number; observedAt: number;
  status: 'aligned' | 'needs_adjustment' | 'not_observable' | 'unavailable';
  checkId: string | null; message: string;
  mode: 'demonstration' | 'practice';
  measurements?: Record<string, number | null>;
};
export type LiveClientMessage =
  | { type: 'clock'; clientSentAt: number }
  | { type: 'context'; sequence: MovementSequence | null; playback: PlaybackState | null; practiceStartedAt?: number | null; practiceStage?: 'watching' | 'ready' | 'performing' | 'review' }
  | { type: 'audio'; data: string }
  | { type: 'audio_end' }
  | { type: 'image'; data: string; observedAt: number }
  | { type: 'text'; text: string }
  | { type: 'form'; report: FormReport }
  | { type: 'practice_attempt'; attempt: PracticeAttempt }
  | { type: 'applied'; commandId: string; ok: boolean }
  | { type: 'control'; name: LiveControl };
export type LiveServerMessage =
  | { type: 'clock'; clientSentAt: number; serverNow: number }
  | { type: 'ready'; conversationModel: string; plannerModel: string }
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string }
  | { type: 'audio'; data: string }
  | { type: 'interrupted' }
  | { type: 'turn_complete' }
  | { type: 'action'; commandId: string; action: LiveAction; expiresAt: number }
  | { type: 'cancel'; commandId: string }
  | { type: 'planning'; active: boolean }
  | { type: 'practice_review'; review: PracticeReview }
  | { type: 'error'; message: string };
