import type { PoseObservation } from '../shared/contracts';

/**
 * Joints the vision track reports to the rest of the app. These names are the contract names the
 * team reads; `libraryName` is what the pose package calls each joint, and `index` is its
 * BlazePose position.
 *
 * Reporting a joint is not the same as requiring it. A check declares which of these it needs in
 * `REQUIRED_GOALPOST_JOINTS`, so an occluded wrist cannot block a shoulder measurement.
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
};

const STRIDE = 4;

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
    const offset = joint.index * STRIDE;
    const x = frame.landmarks[offset];
    const y = frame.landmarks[offset + 1];
    const visibility = frame.landmarks[offset + 3];
    // An absent joint arrives as a zeroed slot in the buffer, which is indistinguishable from a
    // real coordinate at the image origin. Visibility is the only honest discriminator, so a
    // joint the model placed at zero visibility is treated as absent rather than measured.
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!Number.isFinite(visibility) || visibility <= 0) continue;
    landmarks[joint.name] = { x, y, visibility };
  }
  return { observedAt, mirrored: false, landmarks };
}
