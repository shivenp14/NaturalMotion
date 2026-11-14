import type { PoseObservation } from '../shared/contracts';
import { UPPER_BODY_JOINTS, type VisionJointName } from './landmarks';

/**
 * Every distance is divided by shoulder width, so the numbers do not change when the user sits
 * nearer or farther from the phone.
 *
 * Caveat that only the device can settle: the pose library normalizes x by frame width and y by
 * frame height, so a vertical unit is not the same number of pixels as a horizontal one. The
 * ratios below therefore carry a fixed aspect factor for a given phone orientation, which is why
 * thresholds are calibrated on the presentation phone and not copied from a desk calculation.
 */
export type UpperBodyMetrics = {
  /** Euclidean shoulder width in normalized units. The scale divisor. */
  shoulderWidth: number;
  /** Shoulder widths the lower elbow sits above the shoulder line. Negative means dropped. */
  elbowAboveShoulder: number;
  /** Shoulder widths the narrower elbow sits outside its own shoulder. */
  elbowSpread: number;
  /** Shoulder widths between the higher ear and its shoulder. Smaller means shrugged. */
  earToShoulder: number;
};

export const DEFAULT_MIN_VISIBILITY = 0.5;

/** Joints that must be present before any form judgment may be issued. */
export const REQUIRED_GOALPOST_JOINTS: readonly VisionJointName[] = UPPER_BODY_JOINTS.map(
  (joint) => joint.name,
);

/**
 * Landmarks that are absent, or that the model is not confident about.
 * An empty result means the frame can support a judgment.
 */
export function unobservableJoints(
  observation: PoseObservation,
  required: readonly VisionJointName[] = REQUIRED_GOALPOST_JOINTS,
  minVisibility: number = DEFAULT_MIN_VISIBILITY,
): VisionJointName[] {
  return required.filter((name) => {
    const landmark = observation.landmarks[name];
    return !landmark || !Number.isFinite(landmark.visibility) || landmark.visibility < minVisibility;
  });
}

type Point = { x: number; y: number };

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Geometry for the goalpost arm raise. Returns null when the frame cannot produce the
 * measurement, which the caller must report as `not_observable`, never as success.
 */
export function computeUpperBodyMetrics(observation: PoseObservation): UpperBodyMetrics | null {
  const at = (name: VisionJointName): Point | null => observation.landmarks[name] ?? null;
  const leftShoulder = at('left_shoulder');
  const rightShoulder = at('right_shoulder');
  const leftElbow = at('left_elbow');
  const rightElbow = at('right_elbow');
  const leftEar = at('left_ear');
  const rightEar = at('right_ear');
  if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow || !leftEar || !rightEar) {
    return null;
  }

  const shoulderWidth = distance(leftShoulder, rightShoulder);
  if (!Number.isFinite(shoulderWidth) || shoulderWidth <= 0.01) return null;

  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const above = (elbow: Point) => (shoulderMidY - elbow.y) / shoulderWidth;
  const outward = (shoulder: Point, elbow: Point) => Math.abs(elbow.x - shoulder.x) / shoulderWidth;
  const gap = (ear: Point, shoulder: Point) => (shoulder.y - ear.y) / shoulderWidth;

  return {
    shoulderWidth,
    // Report the worse arm: catching either elbow dropping matters more than the average.
    elbowAboveShoulder: Math.min(above(leftElbow), above(rightElbow)),
    elbowSpread: Math.min(outward(leftShoulder, leftElbow), outward(rightShoulder, rightElbow)),
    earToShoulder: Math.min(gap(leftEar, leftShoulder), gap(rightEar, rightShoulder)),
  };
}
