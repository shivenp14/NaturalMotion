import type { PoseObservation } from '../shared/contracts';

/**
 * The upper-body joints this track agrees to consume. Names here are the contract names the
 * team reads; `libraryName` is what the pose package calls each joint.
 *
 * Only joints that have an agreed measurement belong in this table. Adding a joint here is a
 * shared-interface change, because `ComponentDefinition.requiredLandmarks` refers to these
 * names.
 */
export const UPPER_BODY_JOINTS = [
  { name: 'nose', index: 0, libraryName: 'nose' },
  { name: 'left_ear', index: 7, libraryName: 'leftEar' },
  { name: 'right_ear', index: 8, libraryName: 'rightEar' },
  { name: 'left_shoulder', index: 11, libraryName: 'leftShoulder' },
  { name: 'right_shoulder', index: 12, libraryName: 'rightShoulder' },
  { name: 'left_elbow', index: 13, libraryName: 'leftElbow' },
  { name: 'right_elbow', index: 14, libraryName: 'rightElbow' },
  { name: 'left_wrist', index: 15, libraryName: 'leftWrist' },
  { name: 'right_wrist', index: 16, libraryName: 'rightWrist' },
] as const;

export type VisionJointName = (typeof UPPER_BODY_JOINTS)[number]['name'];

/** The parts of a pose-library frame this track reads. Structural, so tests need no native code. */
export type PoseFrameLike = {
  readonly landmarks: ArrayLike<number>;
  /** Present when the caller narrowed the buffer; values are library joint names. */
  readonly selection?: readonly string[];
};

const STRIDE = 4;

type Landmark = { x: number; y: number; visibility: number };

function offsetFor(frame: PoseFrameLike, joint: (typeof UPPER_BODY_JOINTS)[number]): number | null {
  if (frame.selection) {
    const position = frame.selection.indexOf(joint.libraryName);
    return position === -1 ? null : position * STRIDE;
  }
  return joint.index * STRIDE;
}

function readLandmark(frame: PoseFrameLike, joint: (typeof UPPER_BODY_JOINTS)[number]): Landmark | null {
  const offset = offsetFor(frame, joint);
  if (offset === null) return null;
  const x = frame.landmarks[offset];
  const y = frame.landmarks[offset + 1];
  const visibility = frame.landmarks[offset + 3];
  // An absent joint arrives as a zeroed slot in the buffer, which is indistinguishable from a
  // real coordinate at the image origin. Visibility is the only honest discriminator, so a joint
  // the model placed at zero visibility is treated as absent rather than measured.
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isFinite(visibility) || visibility <= 0) return null;
  return { x, y, visibility };
}

/**
 * Convert one pose-library frame into the shared contract.
 *
 * `observedAt` must be wall-clock Unix milliseconds. The library's own `frame.timestamp` is a
 * monotonic clock, so it cannot be compared with `PlaybackState.updatedAt`.
 *
 * `mirrored` is always false: the library reports front-camera x un-mirrored, in the real-world
 * frame, and the preview overlay compensates for the flip itself.
 */
export function toPoseObservation(frame: PoseFrameLike, observedAt: number): PoseObservation {
  const landmarks: PoseObservation['landmarks'] = {};
  for (const joint of UPPER_BODY_JOINTS) {
    const landmark = readLandmark(frame, joint);
    if (landmark) landmarks[joint.name] = landmark;
  }
  return { observedAt, mirrored: false, landmarks };
}
