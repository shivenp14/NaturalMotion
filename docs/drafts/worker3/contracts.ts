/** Draft integration contracts for Worker 1 (vision), Worker 2 (anatomy), Worker 3 (agent).
 * These are prototype interfaces; approve component IDs, cues and parameters together.
 */
export type CameraView = 'front' | 'side' | 'back';
export type MovementSpeed = 'slow' | 'normal';
export type BodySide = 'left' | 'right' | 'both';
export type FormStatus = 'needs_adjustment' | 'aligned' | 'not_observable';

export interface ComponentDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  supportedParameters: {
    speeds: readonly MovementSpeed[];
    sides: readonly BodySide[];
    repetitions: { min: number; max: number; default: number };
    holdSeconds: { min: number; max: number; default: number };
  };
  animationId: string; // must be implemented by Worker 2
  cameraView: CameraView; // agreed with Worker 1
  muscleHighlights: readonly {
    groupId: string; // matches anatomical asset/group vocabulary
    role: 'associated'; // not a measurement of stretch or activation
  }[];
  formChecks: readonly {
    checkId: string; // implemented by Worker 1
    requiredLandmarks: readonly string[];
    correctionCueId: string; // approved wording in CUE_CATALOG
    repositionCueId: string;
    acknowledgmentCueId: string;
  }[];
}

export interface MovementStep {
  stepId: string;
  componentId: string;
  parameters: {
    speed: MovementSpeed;
    side: BodySide;
    repetitions: number;
    holdSeconds: number;
  };
}

export interface MovementSequence {
  sequenceId: string;
  steps: MovementStep[];
}

export interface PlaybackState {
  sequenceId: string;
  stepId: string;
  phase: 'idle' | 'demonstrating' | 'observing' | 'completed' | 'paused';
  updatedAtMs: number;
}

/** Produced by Worker 1, NOT inferred by the LLM from arbitrary text. */
export interface FormEvent {
  eventId: string;
  sequenceId: string;
  stepId: string;
  checkId: string;
  status: FormStatus;
  observedAtMs: number;
  stable: boolean; // Worker 1 debounces temporal fluctuations
  visibilityOk: boolean;
  measurement?: { name: string; value: number; unit: 'degrees' | 'ratio' };
  direction?: 'left' | 'right' | 'none';
}

export type AgentAction =
  | { type: 'play_sequence'; sequence: MovementSequence }
  | { type: 'modify_playback'; stepId: string; parameters: Partial<MovementStep['parameters']> }
  | { type: 'replay_demonstration'; stepId: string }
  | { type: 'speak_cue'; cueId: string } // resolve text locally; do not let LLM invent a correction
  | { type: 'speak_text'; text: string } // general, nonclinical conversation only
  | { type: 'pause_session'; reason: 'user_request' | 'safety' }
  | { type: 'stop_session'; reason: 'user_request' | 'safety' }
  | { type: 'no_action' };

export interface AgentReturn {
  decisionId: string;
  trigger: { type: 'user_utterance' | 'form_event'; id: string };
  actions: AgentAction[];
}

export interface FeedbackState {
  lastStatusByCheck: Record<string, FormStatus | undefined>;
  correctionPendingByCheck: Record<string, boolean | undefined>;
  lastCueTimeByCheck: Record<string, number | undefined>;
}
