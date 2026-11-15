import type { PoseObservation } from '../shared/contracts';
import type { AssessmentCheck, AssessmentMetric, BodySide } from '../shared/assessment';
import { assessmentCheckId } from '../shared/assessment';
import type { FormReport } from '../live/protocol';

type V = [number, number, number];
const sub = (a: V, b: V): V => a.map((v, i) => v - b[i]) as V;
const dot = (a: V, b: V) => a.reduce((n, v, i) => n + v * b[i], 0);
const unit = (a: V): V | null => { const n = Math.hypot(...a); return n > 0.02 ? a.map(v => v / n) as V : null; };
const angle = (a: V, b: V) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180 / Math.PI;

/** Metric-space geometry avoids treating normalized-image x/y as equally scaled pixels. */
export function measureAssessment(observation: PoseObservation, side: BodySide, metric: AssessmentMetric): number | null {
  if (observation.mirrored) return null;
  const required = ['left_shoulder', 'right_shoulder', `${side}_elbow`, ...(metric === 'upper_arm_elevation' ? [] : [`${side}_wrist`]),
    ...(metric === 'elbow_bend' ? [] : ['left_hip', 'right_hip'])];
  const points = new Map<string, V>();
  for (const name of required) {
    const image = observation.landmarks[name], world = observation.worldLandmarks?.[name];
    if (!image || image.visibility < 0.65 || ![image.visibility, image.x, image.y].every(Number.isFinite) ||
      image.x < 0 || image.x > 1 || image.y < 0 || image.y > 1 ||
      !world || ![world.x, world.y, world.z].every(Number.isFinite)) return null;
    points.set(name, [world.x, world.y, world.z]);
  }
  const left = points.get('left_shoulder')!, right = points.get('right_shoulder')!;
  const across = unit(sub(right, left));
  if (!across || Math.abs(across[2]) > 0.55 || Math.abs(observation.landmarks.left_shoulder.x - observation.landmarks.right_shoulder.x) < 0.08) return null;
  const shoulder = points.get(`${side}_shoulder`)!, elbow = points.get(`${side}_elbow`)!;
  const upper = unit(sub(elbow, shoulder));
  if (!upper) return null;
  const wrist = points.get(`${side}_wrist`);
  const forearm = wrist ? unit(sub(wrist, elbow)) : null;
  if (metric === 'elbow_bend') return forearm ? angle(upper, forearm) : null;
  const mid = (a: V, b: V): V => a.map((v, i) => (v + b[i]) / 2) as V;
  const up = unit(sub(mid(left, right), mid(points.get('left_hip')!, points.get('right_hip')!)));
  if (!up) return null;
  if (metric === 'upper_arm_elevation') return angle(upper, up.map(v => -v) as V);
  if (!forearm) return null;
  const outward = unit(sub(shoulder, side === 'left' ? right : left));
  if (!outward) return null;
  const horizontal = unit(outward.map((v, i) => v - up[i] * dot(outward, up)) as V);
  if (!horizontal || Math.hypot(dot(forearm, horizontal), dot(forearm, up)) < 0.5) return null;
  return Math.atan2(dot(forearm, horizontal), dot(forearm, up)) * 180 / Math.PI;
}

export function angularError(actual: number, target: number): number {
  return ((actual - target + 540) % 360) - 180;
}

export function assessmentMessage(status: FormReport['status'], check?: AssessmentCheck, actual?: number | null): string {
  if (status === 'unavailable') return 'No supported assessment is configured for this part of the movement.';
  if (status === 'not_observable') return 'Face the camera and move back so your shoulders, elbows, wrists and hips are visible.';
  if (status === 'aligned') return 'The checked arm positions match the movement shown.';
  if (!check || actual === null || actual === undefined) return 'Match your arm position to the movement shown.';
  if (check.metric === 'upper_arm_elevation') return `${actual < check.targetDeg ? 'Raise' : 'Lower'} your ${check.side} upper arm toward the position shown.`;
  if (check.metric === 'elbow_bend') return `${actual < check.targetDeg ? 'Bend' : 'Straighten'} your ${check.side} elbow a little more to match the movement shown.`;
  return `Point your ${check.side} forearm in the direction shown.`;
}

/** Same classifier on phone and server; the server never reads client-authored feedback wording. */
export function assessMeasurements(checks: readonly AssessmentCheck[], measurements: Record<string, number | null>) {
  const missing = checks.find(check => {
    const n = measurements[assessmentCheckId(check)];
    return typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 180 || (check.metric !== 'forearm_direction' && n < 0);
  });
  const bad = checks.find(check => {
    const n = measurements[assessmentCheckId(check)];
    return typeof n === 'number' && Math.abs(angularError(n, check.targetDeg)) > check.toleranceDeg;
  });
  const status: FormReport['status'] = !checks.length ? 'unavailable' : missing ? 'not_observable' : bad ? 'needs_adjustment' : 'aligned';
  const selected = missing ?? bad ?? checks[0];
  return { status, checkId: selected ? assessmentCheckId(selected) : null,
    message: assessmentMessage(status, selected, selected ? measurements[assessmentCheckId(selected)] : null) };
}
