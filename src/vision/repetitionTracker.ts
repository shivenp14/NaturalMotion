import type { MovementSequence } from '../shared/contracts';
import { ASSESSMENT_METRICS, assessmentCheckId, type AssessmentCheck, type AssessmentPlan } from '../shared/assessment';
import type { PracticeAttempt, PracticeMeasurements, PracticeReview, PracticeSample } from '../shared/practice';
import { compileUpperBodySequence, type UpperBodySegment } from '../anatomy/upperBodySequence';
import { interpolateUpperBodyPose } from '../anatomy/upperBodyPose';
import { angularError } from './assessmentGeometry';
import { targetForArm } from './assessmentPlan';

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
type Driver = { key: string; from: number; change: number };
type Evidence = { step: number; progress: number; sample: PracticeSample };

function driversFor(segment: UpperBodySegment): Driver[] {
  for (const metric of ASSESSMENT_METRICS) {
    const drivers = (['left', 'right'] as const).flatMap(side => {
      const from = targetForArm(segment.from[side], side, metric);
      const change = angularError(targetForArm(segment.to[side], side, metric), from);
      return Math.abs(change) >= 10 ? [{ key: `${side}_${metric}`, from, change }] : [];
    });
    if (drivers.length) return drivers;
  }
  return [];
}

/** Tracks geometry through ordered segments; animation time and correctness never gate progress. */
export class RepetitionTracker {
  readonly program;
  readonly drivers;
  readonly activeSteps: number[];
  step = 0;
  progress = 0;
  completed = false;
  reducedRange = false;
  trackingLost = false;
  private peak = 0;
  private firstProgress = 1;
  private phaseFrames = 0;
  private phaseAt = 0;
  private endpointFrames = 0;
  private reversalFrames = 0;
  private previousAt = 0;
  private ratios: number[] = [];
  private phaseBins = new Set<number>();
  private lastUsableAt = 0;
  readonly evidence: Evidence[] = [];
  constructor(readonly sequence: MovementSequence) {
    this.program = compileUpperBodySequence(sequence);
    this.drivers = this.program.segments.map(driversFor);
    this.activeSteps = this.drivers.flatMap((drivers, index) => drivers.length ? [index] : []);
    this.step = this.activeSteps[0] ?? 0;
  }
  get supported() { return this.activeSteps.length > 0; }
  observe(sample: PracticeSample): void {
    if (this.completed || !this.supported || !Number.isFinite(sample.observedAt) || sample.observedAt <= this.previousAt) return;
    if (this.previousAt && sample.observedAt - this.previousAt > 1000) {
      if (this.step > 0 || this.peak > 0.1) this.trackingLost = true;
      this.ratios = [];
    }
    this.previousAt = sample.observedAt;
    const ratios = this.drivers[this.step].flatMap(driver => {
      const n = sample.measurements[driver.key];
      return typeof n === 'number' && Number.isFinite(n) ? [angularError(n, driver.from) / driver.change] : [];
    });
    if (!ratios.length) {
      if (this.lastUsableAt && sample.observedAt - this.lastUsableAt > 700 && (this.step > 0 || this.peak > 0.1)) this.trackingLost = true;
      return;
    }
    this.lastUsableAt = sample.observedAt;
    const fraction = median(ratios);
    this.ratios = [...this.ratios.slice(-2), fraction];
    const smoothed = median(this.ratios);
    if (!this.phaseAt) this.phaseAt = sample.observedAt;
    this.phaseFrames++;
    this.firstProgress = Math.min(this.firstProgress, clamp(smoothed));
    this.peak = Math.max(this.peak, clamp(smoothed));
    this.progress = clamp(smoothed);
    this.phaseBins.add(Math.floor(this.progress * 4));
    this.evidence.push({ step: this.step, progress: this.progress, sample });
    this.endpointFrames = smoothed >= 0.82 ? this.endpointFrames + 1 : 0;
    // A smaller excursion can still be a finished repetition, followed by a range tip.
    const nextStep = this.activeSteps[this.activeSteps.indexOf(this.step) + 1];
    const next = nextStep === undefined ? undefined : this.drivers[nextStep];
    const reverses = next?.some(driver => this.drivers[this.step].some(previous => previous.key === driver.key && previous.change * driver.change < 0));
    this.reversalFrames = reverses && this.peak >= 0.4 && this.peak - smoothed >= 0.12 ? this.reversalFrames + 1 : 0;
    const traveled = this.peak - this.firstProgress >= 0.25;
    if (!traveled || this.phaseFrames < 4 || this.phaseBins.size < 3 || sample.observedAt - this.phaseAt < 200 ||
      (this.endpointFrames < 2 && this.reversalFrames < 2)) return;
    if (this.reversalFrames >= 2 && this.endpointFrames < 2) this.reducedRange = true;
    if (nextStep === undefined) { this.completed = true; return; }
    this.step = nextStep; this.progress = 0; this.peak = 0; this.firstProgress = 0;
    this.phaseFrames = 0; this.phaseAt = 0; this.endpointFrames = 0; this.reversalFrames = 0; this.ratios = []; this.phaseBins.clear();
  }
}

export function measurementsAt(segment: UpperBodySegment, progress: number, checks: readonly AssessmentCheck[]): PracticeMeasurements {
  const pose = interpolateUpperBodyPose(segment.from, segment.to, clamp(progress));
  return Object.fromEntries(checks.map(check => [assessmentCheckId(check), targetForArm(pose[check.side], check.side, check.metric)]));
}

/** Ignore positioning before departure from the opening pose; never ends recording. */
function movementSamples(tracker: RepetitionTracker, samples: PracticeSample[]): PracticeSample[] {
  const drivers = tracker.drivers[tracker.activeSteps[0]];
  if (!drivers?.length) return [];
  let opening: PracticeSample[] = [];
  for (let i = 0; i < samples.length; i++) {
    const row = samples[i];
    if (opening.length && row.observedAt - opening.at(-1)!.observedAt > 700) opening = [];
    const ratios = drivers.flatMap(driver => {
      const n = row.measurements[driver.key];
      return typeof n === 'number' && Number.isFinite(n) ? [angularError(n, driver.from) / driver.change] : [];
    });
    const fraction = median(ratios);
    if (fraction >= -0.2 && fraction <= 0.2) opening = [...opening.slice(-4), row];
    else if (fraction > 0.2 && opening.length >= 2) return [...opening, ...samples.slice(i)];
    else opening = [];
  }
  return opening;
}

/** Same bounded raw evidence is replayed on phone/server; no client-authored praise is trusted. */
export function reviewPracticeAttempt(sequence: MovementSequence, plan: AssessmentPlan | null, attempt: PracticeAttempt,
  previous?: PracticeReview | null): PracticeReview {
  const base = { sequenceId: sequence.id, attemptId: attempt.attemptId, checkId: null };
  if (!plan?.checks.length || plan.sequenceId !== sequence.id) return { ...base, status: 'unavailable', message: 'I can demonstrate this movement, but cannot assess it yet.' };
  const tracker = new RepetitionTracker(sequence);
  for (const sample of movementSamples(tracker, attempt.samples)) tracker.observe(sample);
  if (!tracker.supported) return { ...base, status: 'unavailable', message: 'I cannot reliably track a full repetition of this movement yet.' };
  if (!tracker.completed) {
    const visible = tracker.evidence.length >= 4;
    return { ...base, status: visible ? 'incomplete' : 'not_observable', message: visible
      ? 'I did not see the full movement and return clearly enough to review it. Try one complete repetition at your own pace.'
      : 'I could not see enough of that repetition to judge your form. Move back so your shoulders, elbows, wrists and hips are visible, then try again.' };
  }
  if (tracker.trackingLost) return { ...base, status: 'not_observable', message: 'I lost sight of part of that repetition, so I cannot confidently judge it. Try again with your arms and hips in view.' };
  const activeChecks = plan.checks.filter(check => tracker.drivers[check.stepIndex].length > 0);
  if (!activeChecks.length) return { ...base, status: 'unavailable', message: 'This demonstration has no supported checks for the moving part of the repetition.' };
  const problems: { check: AssessmentCheck; error: number; score: number }[] = [];
  for (const check of activeChecks) {
    const rows = tracker.evidence.filter(row => row.step === check.stepIndex);
    const errors = rows.flatMap(row => {
      const actual = row.sample.measurements[assessmentCheckId(check)];
      const target = measurementsAt(tracker.program.segments[row.step], row.progress, [check])[assessmentCheckId(check)]!;
      return typeof actual === 'number' && Number.isFinite(actual) ? [{ error: angularError(actual, target), progress: row.progress }] : [];
    });
    const bins = new Set(errors.map(row => Math.floor(row.progress * 4)));
    if (errors.length < 4 || errors.length / Math.max(1, rows.length) < 0.7 || bins.size < 3) return {
      ...base, status: 'not_observable', message: 'I could not see the whole arm movement clearly enough to judge it. Try again with both arms and hips in view.' };
    const error = median(errors.map(row => row.error));
    const persistent = errors.filter(row => Math.abs(row.error) > check.toleranceDeg + 8).length / errors.length;
    if (Math.abs(error) > check.toleranceDeg + 8 && persistent >= 0.65) problems.push({ check, error, score: Math.abs(error) / check.toleranceDeg });
    else if (Math.abs(error) > check.toleranceDeg) return { ...base, status: 'not_observable', message: 'The camera estimate was too uncertain for a confident form judgment. Try once more with your arms fully visible.' };
  }
  const problem = problems.sort((a, b) => b.score - a.score)[0];
  if (problem) {
    const { check, error } = problem;
    const cue = check.metric === 'elbow_bend' ? `keep your ${check.side} elbow ${error < 0 ? 'a little more bent' : 'a little straighter'} as your arm moves` :
      check.metric === 'upper_arm_elevation' ? `match the ${check.side} upper-arm position more closely` : `match the direction of your ${check.side} forearm more closely`;
    return { ...base, checkId: assessmentCheckId(check), status: 'needs_adjustment', message: `For the next repetition, ${cue}.` };
  }
  if (tracker.reducedRange) return { ...base, status: 'needs_adjustment', message: 'You completed the return, but used a smaller movement than the demonstration. On the next repetition, follow the demonstrated path only as far as feels comfortable.' };
  const fullCoverage = activeChecks.length === tracker.activeSteps.length * 6;
  const improved = previous?.sequenceId === sequence.id && previous.status === 'needs_adjustment';
  return { ...base, status: 'aligned', message: improved
    ? fullCoverage ? 'That looked better—you matched the arm movement that time. Good work.' : 'That looked better in the arm positions I could assess. Good work.'
    : fullCoverage ? 'That looked good—you performed the arm movement as demonstrated. Good work.' : 'That looked good in the arm positions I could assess. Good work.' };
}
