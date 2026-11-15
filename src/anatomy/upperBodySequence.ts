import type { ComponentDefinition, MovementCommand, MovementSequence, PlaybackState } from '../shared/contracts';
import { validateSequence } from '../shared/validateSequence';
import { initialUpperBodyPose, interpolateUpperBodyPose, upperBodyPoseError, type ArmPose, type UpperBodyPose } from './upperBodyPose';
import { validateWallAngelParameters, type WallAngelParameters } from './wallAngel';
import { getPartFocusCodes } from './regions';

const axes = [
  { id: 'shoulder_elevation', key: 'elevationDeg', minimum: 90, maximum: 150, regions: ['deltoid_lateral', 'trapezius_upper'] },
  { id: 'elbow_flexion', key: 'elbowFlexionDeg', minimum: 20, maximum: 90, regions: ['biceps_brachii_short', 'triceps_long'] },
  { id: 'shoulder_external_rotation', key: 'externalRotationDeg', minimum: 80, maximum: 100, regions: ['infraspinatus', 'deltoid_posterior'] },
] as const;
const bindings = (['left', 'right'] as const).flatMap((side) => axes.map((axis) => ({ ...axis, side, componentId: `${side}_${axis.id}` })));

/** Executable rendering capabilities, not yet registered in the agent catalog. */
export const upperBodyPreviewCatalog: readonly ComponentDefinition[] = bindings.map((binding) => ({
  id: binding.componentId, label: `${binding.side} ${binding.id.replaceAll('_', ' ')}`,
  parameters: {
    fromDeg: { minimum: binding.minimum, maximum: binding.maximum },
    toDeg: { minimum: binding.minimum, maximum: binding.maximum },
  },
  controlledChannels: [`${binding.side}.${binding.key}`], muscleRegionIds: binding.regions,
  // Vision metadata must come from Derrick; no checks are claimed here.
  cameraView: 'unconfigured', requiredLandmarks: [], supportedCheckIds: [],
}));

export type UpperBodySegment = {
  from: UpperBodyPose; to: UpperBodyPose; durationSeconds: number; holdSeconds: number;
  phase: 'moving' | 'returning';
  focusCodes: ReadonlySet<number>;
};
export type UpperBodyProgram = { id: string; segments: readonly UpperBodySegment[]; durationSeconds: number };

function buildSegments(sequence: MovementSequence): UpperBodySegment[] {
  let current = initialUpperBodyPose();
  return sequence.steps.map((step) => {
    if (!('parallel' in step)) throw new Error('Upper-body execution requires timed parallel groups.');
    if (step.durationSeconds < 2 || step.durationSeconds > 5 || step.holdSeconds > 2) throw new Error('Timing exceeds the calibrated preview limits.');
    const to = { left: { ...current.left }, right: { ...current.right } };
    const focusCodes = new Set<number>();
    for (const command of step.parallel) {
      const binding = bindings.find((entry) => entry.componentId === command.componentId);
      if (!binding) throw new Error('Unimplemented upper-body component.');
      if (Math.abs(command.parameters.fromDeg - current[binding.side][binding.key]) > 0.0001) throw new Error('Discontinuous movement start.');
      to[binding.side][binding.key] = command.parameters.toDeg;
      for (const code of getPartFocusCodes(binding.regions, binding.side)) focusCodes.add(code);
    }
    const error = upperBodyPoseError(to);
    if (error) throw new Error(error);
    // The constraints are convex; shared interpolation remains inside them.
    const phase = to.left.elevationDeg + to.right.elevationDeg < current.left.elevationDeg + current.right.elevationDeg ? 'returning' : 'moving';
    const segment = { from: current, to, durationSeconds: step.durationSeconds, holdSeconds: step.holdSeconds, phase, focusCodes } as const;
    current = to;
    return segment;
  });
}

export function validateUpperBodyComposition(sequence: MovementSequence): string | null {
  try { buildSegments(sequence); return null; }
  catch (error) { return error instanceof Error ? error.message : 'Unsupported upper-body composition.'; }
}

/** Always revalidate at the renderer boundary, even after upstream validation. */
export function compileUpperBodySequence(input: unknown): UpperBodyProgram {
  const result = validateSequence(input, upperBodyPreviewCatalog, validateUpperBodyComposition);
  if (!result.ok) throw new Error(result.error);
  const segments = buildSegments(result.sequence);
  return { id: result.sequence.id, segments, durationSeconds: segments.reduce((sum, segment) => sum + segment.durationSeconds + segment.holdSeconds, 0) };
}

export function sampleUpperBodyProgram(program: UpperBodyProgram, elapsedSeconds: number) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error('Invalid playback time.');
  let remaining = elapsedSeconds;
  for (let index = 0; index < program.segments.length; index++) {
    const segment = program.segments[index];
    const total = segment.durationSeconds + segment.holdSeconds;
    if (remaining < total) {
      const moving = remaining < segment.durationSeconds;
      const t = Math.min(remaining / segment.durationSeconds, 1);
      return {
        pose: interpolateUpperBodyPose(segment.from, segment.to, t * t * (3 - 2 * t)),
        stepIndex: index, phase: moving ? segment.phase : 'holding' as const, completed: false,
        phaseElapsedSeconds: moving ? remaining : remaining - segment.durationSeconds,
      };
    }
    remaining -= total;
  }
  const index = program.segments.length - 1;
  return { pose: program.segments[index].to, stepIndex: index, phase: 'completed' as const, completed: true, phaseElapsedSeconds: 0 };
}

/** Example composition; the executor contains no exercise-ID dispatch. */
export function createWallAngelReference(parameters: WallAngelParameters, id: string): MovementSequence {
  validateWallAngelParameters(parameters);
  const initial = initialUpperBodyPose();
  const topArm: ArmPose = { elevationDeg: parameters.topAngleDeg, elbowFlexionDeg: 20, externalRotationDeg: 90 };
  const top = { left: { ...topArm }, right: { ...topArm } };
  function commands(from: UpperBodyPose, to: UpperBodyPose): MovementCommand[] {
    return bindings.map((binding) => ({ componentId: binding.componentId, parameters: { fromDeg: from[binding.side][binding.key], toDeg: to[binding.side][binding.key] } }));
  }
  return { id, steps: [
    { parallel: commands(initial, top), durationSeconds: parameters.travelSeconds, holdSeconds: parameters.holdSeconds },
    { parallel: commands(top, initial), durationSeconds: parameters.travelSeconds, holdSeconds: 0 },
  ] };
}

/** Boundaries plus bounded progress updates keep camera targets synchronized after pauses/stalls. */
export function createPlaybackReporter(sequenceId: string, emit: (state: PlaybackState) => void) {
  let previous = '';
  let lastEmittedAt = 0;
  return (stepIndex: number, phase: PlaybackState['phase'], status: PlaybackState['status'], now: number, phaseElapsedSeconds?: number) => {
    const key = `${stepIndex}:${phase}:${status}`;
    if (key === previous && (phaseElapsedSeconds === undefined || status !== 'playing' || now - lastEmittedAt < 250)) return;
    previous = key; lastEmittedAt = now;
    emit({ sequenceId, stepIndex, phase, status, updatedAt: now, ...(phaseElapsedSeconds !== undefined ? { phaseElapsedSeconds } : {}) });
  };
}
