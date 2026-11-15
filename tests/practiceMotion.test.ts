import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PracticeMotionDetector } from '../src/vision/practiceMotion';
import type { PoseObservation } from '../src/shared/contracts';

function pose(shift = 0, visible = 1): PoseObservation {
  const joint = (x: number, y: number) => ({ x, y, visibility: visible });
  return { observedAt: 1000, mirrored: false, landmarks: {
    left_shoulder: joint(0.3, 0.3), right_shoulder: joint(0.7, 0.3),
    left_elbow: joint(0.3, 0.5 - shift), right_elbow: joint(0.7, 0.5),
  } };
}
test('practice detector requires sustained visible arm motion', () => {
  const detector = new PracticeMotionDetector();
  assert.equal(detector.update(pose()), false);
  assert.equal(detector.update(pose(0.2)), false);
  assert.equal(detector.update(pose(0.2)), false);
  assert.equal(detector.update(pose(0.2)), true);
});
test('missing pose resets movement evidence instead of detecting practice', () => {
  const detector = new PracticeMotionDetector();
  detector.update(pose()); detector.update(pose(0.2)); detector.update(pose(0.2));
  assert.equal(detector.update(pose(0.2, 0)), false);
  assert.equal(detector.update(pose(0.2)), false);
});
