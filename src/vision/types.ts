import type { FormEvent, PlaybackState, PoseObservation } from '../shared/contracts';

/** Person 1 owns the native camera implementation and component-specific checks. */
export interface VisionAdapter {
  start(onObservation: (observation: PoseObservation) => void): Promise<void>;
  stop(): Promise<void>;
}

export type FormEvaluator = (
  observation: PoseObservation,
  playback: PlaybackState,
) => FormEvent | null;
