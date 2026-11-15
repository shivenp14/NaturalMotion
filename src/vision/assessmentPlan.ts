import type { MovementSequence, PlaybackState } from '../shared/contracts';
import { ASSESSMENT_METRICS, type AssessmentCheck, type AssessmentMetric, type AssessmentPlan, type AssessmentSelection, type BodySide } from '../shared/assessment';
import { hasOnlyKeys, isRecord } from '../shared/validation';
import { compileUpperBodySequence } from '../anatomy/upperBodySequence';
import { interpolateUpperBodyPose, type ArmPose } from '../anatomy/upperBodyPose';

// Runtime sequences have already crossed validation and are replaced, never edited.
const programs = new WeakMap<MovementSequence, ReturnType<typeof compileUpperBodySequence>>();
function runtimeProgram(sequence: MovementSequence) {
  let program = programs.get(sequence);
  if (!program) { program = compileUpperBodySequence(sequence); programs.set(sequence, program); }
  return program;
}

type V = [number, number, number];
const dot = (a: V, b: V) => a.reduce((n, v, i) => n + v * b[i], 0);
const unit = (a: V): V => { const n = Math.hypot(...a); return a.map(v => v / n) as V; };
const angle = (a: V, b: V) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180 / Math.PI;

/** Explicit geometric mapping of wallAngel.ts arm vectors, not clinical rig-angle equivalence. */
export function targetForArm(arm: ArmPose, side: BodySide, metric: AssessmentMetric): number {
  const sign = side === 'left' ? 1 : -1;
  const e = arm.elevationDeg * Math.PI / 180, f = arm.elbowFlexionDeg * Math.PI / 180;
  const upper = unit([sign * Math.sin(e), -Math.cos(e), -0.22]);
  const forearm: V = [sign * Math.sin(e + f), -Math.cos(e + f), 0];
  const a = sign * (arm.externalRotationDeg - 90) * Math.PI / 180;
  const cross: V = [upper[1] * forearm[2] - upper[2] * forearm[1], upper[2] * forearm[0] - upper[0] * forearm[2], upper[0] * forearm[1] - upper[1] * forearm[0]];
  const rotated = forearm.map((v, i) => v * Math.cos(a) + cross[i] * Math.sin(a) + upper[i] * dot(upper, forearm) * (1 - Math.cos(a))) as V;
  if (metric === 'upper_arm_elevation') return angle(upper, [0, -1, 0]);
  if (metric === 'elbow_bend') return angle(upper, rotated);
  return Math.atan2(sign * rotated[0], rotated[1]) * 180 / Math.PI;
}

export function buildAssessmentPlan(sequence: MovementSequence, input: unknown): AssessmentPlan {
  const program = compileUpperBodySequence(sequence);
  if (!Array.isArray(input) || input.length > Math.min(192, sequence.steps.length * 6)) throw new Error('Invalid assessment selections.');
  const seen = new Set<string>();
  const checks = input.map(value => {
    if (!isRecord(value) || !hasOnlyKeys(value, ['stepIndex', 'side', 'metric', 'toleranceDeg']) ||
      !Number.isInteger(value.stepIndex) || (value.stepIndex as number) < 0 || (value.stepIndex as number) >= program.segments.length ||
      !['left', 'right'].includes(String(value.side)) || !ASSESSMENT_METRICS.includes(value.metric as AssessmentMetric) ||
      typeof value.toleranceDeg !== 'number' || !Number.isFinite(value.toleranceDeg) || value.toleranceDeg < 12 || value.toleranceDeg > 25) throw new Error('Unsupported assessment check.');
    const selection = value as AssessmentSelection;
    const key = `${selection.stepIndex}:${selection.side}:${selection.metric}`;
    if (seen.has(key)) throw new Error('Duplicate assessment check.'); seen.add(key);
    return { ...selection, targetDeg: targetForArm(program.segments[selection.stepIndex].to[selection.side], selection.side, selection.metric) };
  });
  return { sequenceId: sequence.id, checks };
}

export function validateAssessmentPlan(input: unknown, sequence: MovementSequence): AssessmentPlan | null {
  if (input === undefined || input === null) return null;
  if (!isRecord(input) || !hasOnlyKeys(input, ['sequenceId', 'checks']) || input.sequenceId !== sequence.id || !Array.isArray(input.checks)) throw new Error('Assessment does not match movement.');
  const selections = input.checks.map(check => {
    if (!isRecord(check) || !hasOnlyKeys(check, ['stepIndex', 'side', 'metric', 'toleranceDeg', 'targetDeg']) || typeof check.targetDeg !== 'number') throw new Error('Invalid assessment target.');
    return { stepIndex: check.stepIndex, side: check.side, metric: check.metric, toleranceDeg: check.toleranceDeg };
  });
  const expected = buildAssessmentPlan(sequence, selections);
  expected.checks.forEach((check, i) => { if (Math.abs(check.targetDeg - (input.checks as AssessmentCheck[])[i].targetDeg) > 0.0001 || !Number.isFinite((input.checks as AssessmentCheck[])[i].targetDeg)) throw new Error('Assessment target conflicts with movement.'); });
  return expected;
}

export function currentAssessmentChecks(plan: AssessmentPlan, sequence: MovementSequence, playback: PlaybackState, now: number): AssessmentCheck[] {
  const segment = runtimeProgram(sequence).segments[playback.stepIndex];
  if (!segment || playback.sequenceId !== sequence.id || plan.sequenceId !== sequence.id || playback.phase === 'preparing' || playback.status === 'paused') return [];
  const moving = playback.phase === 'moving' || playback.phase === 'returning';
  const t = Math.max(0, Math.min(1, ((playback.phaseElapsedSeconds ?? 0) + (now - playback.updatedAt) / 1000) / segment.durationSeconds));
  const pose = moving ? interpolateUpperBodyPose(segment.from, segment.to, t * t * (3 - 2 * t)) : segment.to;
  return plan.checks.filter(check => check.stepIndex === playback.stepIndex).map(check => ({ ...check, targetDeg: targetForArm(pose[check.side], check.side, check.metric) }));
}

export function readinessChecks(sequence: MovementSequence): AssessmentCheck[] {
  const pose = runtimeProgram(sequence).segments[0].from;
  return (['left', 'right'] as const).flatMap(side => ASSESSMENT_METRICS.map(metric => ({ stepIndex: 0, side, metric, toleranceDeg: 22, targetDeg: targetForArm(pose[side], side, metric) })));
}
