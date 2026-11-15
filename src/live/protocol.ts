import type { MovementSequence, PlaybackState } from '../shared/contracts';
import type { AssessmentPlan } from '../shared/assessment';

export type LiveControl = 'pause_movement' | 'resume_movement' | 'stop_movement';
export type LiveAction = { type: 'play_sequence'; sequence: MovementSequence; assessmentPlan?: AssessmentPlan | null } | { type: LiveControl };
export type FormReport = {
  sequenceId: string; stepIndex: number; observedAt: number;
  status: 'aligned' | 'needs_adjustment' | 'not_observable' | 'unavailable';
  checkId: string | null; message: string;
  mode: 'demonstration' | 'practice';
  measurements?: Record<string, number | null>;
};
export type LiveClientMessage =
  | { type: 'clock'; clientSentAt: number }
  | { type: 'context'; sequence: MovementSequence | null; playback: PlaybackState | null; practiceStartedAt?: number | null }
  | { type: 'audio'; data: string }
  | { type: 'image'; data: string; observedAt: number }
  | { type: 'text'; text: string }
  | { type: 'form'; report: FormReport }
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
  | { type: 'error'; message: string };
