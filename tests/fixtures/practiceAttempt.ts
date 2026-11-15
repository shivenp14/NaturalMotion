import type { MovementSequence } from '../../src/shared/contracts';
import type { PracticeAttempt } from '../../src/shared/practice';
import { ASSESSMENT_METRICS } from '../../src/shared/assessment';
import { compileUpperBodySequence, sampleUpperBodyProgram } from '../../src/anatomy/upperBodySequence';
import { targetForArm } from '../../src/vision/assessmentPlan';

/** Explicit synthetic protocol evidence, not a camera or human acceptance result. */
export function syntheticPracticeAttempt(sequence: MovementSequence, startedAt: number, attemptId = 'synthetic-attempt'): PracticeAttempt {
  const program = compileUpperBodySequence(sequence);
  const duration = 3000;
  const samples = Array.from({ length: 36 }, (_, index) => {
    const pose = sampleUpperBodyProgram(program, Math.min(index * 100 / duration, 1) * program.durationSeconds).pose;
    return { observedAt: startedAt + index * 100, measurements: Object.fromEntries((['left', 'right'] as const).flatMap(side =>
      ASSESSMENT_METRICS.map(metric => [`${side}_${metric}`, targetForArm(pose[side], side, metric)]))) };
  });
  return { sequenceId: sequence.id, attemptId, startedAt, endedAt: samples.at(-1)!.observedAt, samples };
}
