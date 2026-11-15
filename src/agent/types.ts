import type { ComponentDefinition, FormEvent, MovementSequence, MovementStep, PlaybackState } from '../shared/contracts';

export type AgentRequest = {
  utterance: string;
  catalog: readonly ComponentDefinition[];
  currentSequence: MovementSequence | null;
  observation?: FormEvent;
  cues?: Readonly<Record<string, string>>;
};

/** Provider output is untrusted; validateAgentReturn must run before dispatch. */
export interface AgentAdapter {
  respond(request: AgentRequest, signal?: AbortSignal): Promise<unknown>;
}

/** All movement payloads use the renderer's canonical shared contracts. */
export type AgentAction =
  | { type: 'play_sequence'; sequence: MovementSequence }
  /** Replace one complete step, including every simultaneous command and group timing. */
  | { type: 'modify_playback'; stepIndex: number; step: MovementStep }
  | { type: 'replay_demonstration'; stepIndex: number }
  | { type: 'speak_cue'; cueId: string }
  | { type: 'speak_text'; text: string }
  | { type: 'pause_session'; reason: 'user_request' | 'safety' }
  | { type: 'stop_session'; reason: 'user_request' | 'safety' }
  | { type: 'no_action' };

export interface AgentReturn {
  decisionId: string;
  trigger: { type: 'user_utterance' | 'form_event'; id: string };
  actions: AgentAction[];
}

/** Agent-owned cue routing; adds no fields to anatomy/vision component definitions. */
export type CheckFeedbackDefinition = {
  componentId: string;
  checkId: string;
  phases: readonly PlaybackState['phase'][];
  correctionCueId: string;
  repositionCueId: string;
  acknowledgmentCueId: string;
};
export type FormStatus = FormEvent['status'];
export interface FeedbackState {
  contextKey?: string;
  lastObservationByCheck: Record<string, number | undefined>;
  lastSpokenStatusByCheck: Record<string, FormStatus | undefined>;
  lastStatusByCheck: Record<string, FormStatus | undefined>;
  correctionPendingByCheck: Record<string, boolean | undefined>;
  lastCueTimeByCheck: Record<string, number | undefined>;
}
