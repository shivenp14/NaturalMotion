import type { PoseObservation } from '../shared/contracts';

/** Detect sustained arm motion relative to the shoulders; this is not a form assessment. */
export class PracticeMotionDetector {
  private baseline: number[] | null = null;
  private movingFrames = 0;
  reset() { this.baseline = null; this.movingFrames = 0; }
  update(observation: PoseObservation): boolean {
    const { left_shoulder: left, right_shoulder: right, left_elbow: le, right_elbow: re } = observation.landmarks;
    if (![left, right, le, re].every(joint => joint && joint.visibility >= 0.5)) { this.reset(); return false; }
    const width = Math.hypot(left.x - right.x, left.y - right.y);
    if (width < 0.05) { this.reset(); return false; }
    const pose = [(le.x - left.x) / width, (le.y - left.y) / width, (re.x - right.x) / width, (re.y - right.y) / width];
    if (!this.baseline) { this.baseline = pose; return false; }
    const delta = Math.max(...pose.map((value, index) => Math.abs(value - this.baseline![index])));
    this.movingFrames = delta > 0.35 ? this.movingFrames + 1 : 0;
    if (this.movingFrames >= 3) { this.reset(); return true; }
    return false;
  }
}
