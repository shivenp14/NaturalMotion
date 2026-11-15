import type { PoseObservation } from '../shared/contracts';

/**
 * Joints the vision track reports to the rest of the app. These names are the contract names the
 * team reads; `libraryName` is what the pose package calls each joint, and `index` is its
 * BlazePose position.
 *
 * Reporting a joint is not the same as requiring it. A check declares which of these it needs in
 * its geometry requirements, so an occluded wrist cannot block an upper-arm measurement.
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
  { name: 'left_hip', index: 23, libraryName: 'leftHip' },
  { name: 'right_hip', index: 24, libraryName: 'rightHip' },
] as const;

export type VisionJointName = (typeof UPPER_BODY_JOINTS)[number]['name'];

/** The parts of a pose-library frame this track reads. Structural, so tests need no native code. */
export type PoseFrameLike = {
  readonly landmarks: ArrayLike<number>;
  /** Monotonic result clock in milliseconds. Not wall time; never compare it with `Date.now()`. */
  readonly timestamp?: number;
  readonly worldLandmarks?: ArrayLike<number>;
};

/**
 * True when a frame is newer than the last one accepted.
 *
 * After a JavaScript stall the library can hand back a result it already delivered. That repeats
 * the previous timestamp, and accepting it would refresh the stabilizer and hide a tracking loss.
 * Comparing the library's own monotonic clock avoids mixing it with wall time.
 */
export function isFreshFrame(previous: number | null, next: number | undefined): boolean {
  if (next === undefined || previous === null) return true;
  return next > previous;
}

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
  const worldLandmarks: NonNullable<PoseObservation['worldLandmarks']> = {};
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
    if (frame.worldLandmarks) {
      const [wx, wy, wz] = [frame.worldLandmarks[offset], frame.worldLandmarks[offset + 1], frame.worldLandmarks[offset + 2]];
      if ([wx, wy, wz].every(Number.isFinite)) worldLandmarks[joint.name] = { x: wx, y: wy, z: wz };
    }
  }
  return { observedAt, mirrored: false, landmarks, ...(Object.keys(worldLandmarks).length ? { worldLandmarks } : {}) };
}
