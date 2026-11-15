import type { PoseObservation } from '../shared/contracts';
import type { VisionJointName } from './landmarks';

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

/**
 * Joints the goalpost check actually measures. Verified shoulders, elbows and ears only: requiring
 * a joint that no measurement reads would turn an occluded wrist into a false `not_observable`.
 */
export const REQUIRED_GOALPOST_JOINTS: readonly VisionJointName[] = [
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_ear',
  'right_ear',
];

/**
 * Landmarks that are absent, or that the model is not confident about.
 * An empty result means the frame can support a judgment.
 */
export function unobservableJoints(observation: PoseObservation): VisionJointName[] {
  return REQUIRED_GOALPOST_JOINTS.filter((name) => {
    const landmark = observation.landmarks[name];
    return !landmark || landmark.visibility < DEFAULT_MIN_VISIBILITY;
  });
}

type Point = { x: number; y: number };

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Geometry for the goalpost arm raise. Returns null when the frame cannot produce the
 * measurement, which the caller must report as `not_observable`, never as success.
 */
export function computeUpperBodyMetrics(observation: PoseObservation): UpperBodyMetrics | null {
  if (unobservableJoints(observation).length > 0) return null;

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
  if (shoulderWidth < 0.08) return null;

  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const midlineX = (leftShoulder.x + rightShoulder.x) / 2;
  const above = (elbow: Point) => (shoulderMidY - elbow.y) / shoulderWidth;
  // Positive only when the elbow is further out on its own shoulder's side of the midline. Both a
  // tucked elbow and one crossed past the opposite shoulder go negative; a bare |dx| scored the
  // second as a wide spread.
  const outward = (shoulder: Point, elbow: Point) =>
    (Math.sign(shoulder.x - midlineX) * (elbow.x - shoulder.x)) / shoulderWidth;
  const gap = (ear: Point, shoulder: Point) => (shoulder.y - ear.y) / shoulderWidth;
  const earToShoulder = Math.min(gap(leftEar, leftShoulder), gap(rightEar, rightShoulder));
  if (earToShoulder <= 0.05) return null;

  return {
    shoulderWidth,
    // Report the worse arm: catching either elbow dropping matters more than the average.
    elbowAboveShoulder: Math.min(above(leftElbow), above(rightElbow)),
    elbowSpread: Math.min(outward(leftShoulder, leftElbow), outward(rightShoulder, rightElbow)),
    earToShoulder,
  };
}
