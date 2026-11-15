import type { PracticeAttempt } from '../shared/practice';
import { ASSESSMENT_METRICS } from '../shared/assessment';
import { hasOnlyKeys, isRecord } from '../shared/validation';

const keys = (['left', 'right'] as const).flatMap(side => ASSESSMENT_METRICS.map(metric => `${side}_${metric}`));

export function validatePracticeAttempt(input: unknown, sequenceId: string, now: number): PracticeAttempt {
  if (!isRecord(input) || !hasOnlyKeys(input, ['sequenceId', 'attemptId', 'startedAt', 'endedAt', 'samples']) || input.sequenceId !== sequenceId ||
    typeof input.attemptId !== 'string' || !input.attemptId || input.attemptId.length > 128 ||
    typeof input.startedAt !== 'number' || !Number.isFinite(input.startedAt) || typeof input.endedAt !== 'number' || !Number.isFinite(input.endedAt) ||
    input.endedAt < input.startedAt || input.endedAt - input.startedAt > 120_000 || now - input.endedAt > 10_000 || input.endedAt > now + 1000 ||
    !Array.isArray(input.samples) || input.samples.length > 900) throw new Error('Invalid practice evidence.');
  let previous = input.startedAt - 1;
  const samples = input.samples.map(sample => {
    if (!isRecord(sample) || !hasOnlyKeys(sample, ['observedAt', 'measurements']) || typeof sample.observedAt !== 'number' ||
      !Number.isFinite(sample.observedAt) || sample.observedAt <= previous || sample.observedAt > (input.endedAt as number) ||
      !isRecord(sample.measurements) || !hasOnlyKeys(sample.measurements, keys) || Object.values(sample.measurements).some(n =>
        n !== null && (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 180))) throw new Error('Invalid practice sample.');
    previous = sample.observedAt;
    return { observedAt: sample.observedAt, measurements: { ...sample.measurements } as Record<string, number | null> };
  });
  return { sequenceId, attemptId: input.attemptId, startedAt: input.startedAt, endedAt: input.endedAt, samples };
}
