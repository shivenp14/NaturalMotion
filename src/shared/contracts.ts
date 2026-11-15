/** Stable boundaries between the three team tracks. Times are Unix milliseconds. */
export type ParameterLimit = {
  minimum: number;
  maximum: number;
  integer?: boolean;
};

export type ComponentDefinition = {
  id: string;
  label: string;
  parameters: Record<string, ParameterLimit>;
  muscleRegionIds: readonly string[];
  cameraView: string;
  requiredLandmarks: readonly string[];
  supportedCheckIds: readonly string[];
  /** Renderer channels this component writes; required for parallel use. */
  controlledChannels?: readonly string[];
};

export type MovementCommand = {
  componentId: string;
  parameters: Record<string, number>;
};

/** Commands start together and reach their endpoints over the same duration. */
export type ParallelMovementStep = {
  parallel: MovementCommand[];
  durationSeconds: number;
  holdSeconds: number;
};

/** Legacy single-component steps remain supported during integration. */
export type MovementStep = MovementCommand | ParallelMovementStep;

export type MovementSequence = { id: string; steps: MovementStep[] };

export type PlaybackState = {
  sequenceId: string;
  stepIndex: number;
  phase: 'preparing' | 'moving' | 'holding' | 'returning' | 'completed';
  status: 'playing' | 'paused' | 'completed';
  updatedAt: number;
};

/** Image-relative x/y in [0,1]; confidence/visibility is an estimate in [0,1]. */
export type PoseObservation = {
  observedAt: number;
  mirrored: boolean;
  landmarks: Record<string, { x: number; y: number; visibility: number }>;
};

export type FormEvent = {
  sequenceId: string;
  stepIndex: number;
  checkId: string;
  status: 'needs_adjustment' | 'aligned' | 'not_observable';
  observedAt: number;
  /** Geometric evidence only; this is not a diagnosis or activation measurement. */
  measurements: Record<string, number>;
};

export type SessionPhase =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'demonstrating'
  | 'following';
