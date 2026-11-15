import type { ComponentDefinition, MovementCommand, MovementSequence, PlaybackState } from '../shared/contracts';
import { validateSequence } from '../shared/validateSequence';
import { initialUpperBodyPose, cloneUpperBodyPose, interpolateUpperBodyPose, upperBodyPoseError, type UpperBodyPose } from './upperBodyPose';
import { validateWallAngelParameters, type WallAngelParameters } from './wallAngel';
import { getPartFocusCodes } from './regions';

import { upperBodyControls } from './upperBodyControls';

/** Executable rendering capabilities, not yet registered in the agent catalog. */
export const upperBodyPreviewCatalog: readonly ComponentDefinition[] = upperBodyControls.map((binding) => ({
  id: binding.id, label: `${binding.group} ${binding.label}`,
  parameters: {
    fromDeg: { minimum: binding.minimum, maximum: binding.maximum },
    toDeg: { minimum: binding.minimum, maximum: binding.maximum },
  },
  controlledChannels: [binding.channel], muscleRegionIds: binding.regions,
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
    const to = cloneUpperBodyPose(current);
    const focusCodes = new Set<number>();
    for (const command of step.parallel) {
      const binding = upperBodyControls.find((entry) => entry.id === command.componentId);
      if (!binding) throw new Error('Unimplemented upper-body component.');
      if (Math.abs(command.parameters.fromDeg - binding.read(current)) > 0.0001) throw new Error('Discontinuous movement start.');
      binding.write(to, command.parameters.toDeg);
      for (const side of binding.group === 'left' || binding.group === 'right' ? [binding.group] as const : ['left', 'right'] as const) {
        for (const code of getPartFocusCodes(binding.regions, side)) focusCodes.add(code);
      }
    }
    const error = upperBodyPoseError(to);
    if (error) throw new Error(error);
    // The constraints are convex; shared interpolation remains inside them.
    const distanceFromStart = (pose: UpperBodyPose) => upperBodyControls.reduce((sum, binding) =>
      sum + Math.abs(binding.read(pose) - binding.neutral) / (binding.maximum - binding.minimum), 0);
    const phase = distanceFromStart(to) < distanceFromStart(current) ? 'returning' : 'moving';
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
      };
    }
    remaining -= total;
  }
  const index = program.segments.length - 1;
  return { pose: program.segments[index].to, stepIndex: index, phase: 'completed' as const, completed: true };
}

/** Example composition; the executor contains no exercise-ID dispatch. */
export function createWallAngelReference(parameters: WallAngelParameters, id: string): MovementSequence {
  validateWallAngelParameters(parameters);
  const initial = initialUpperBodyPose();
  const top = cloneUpperBodyPose(initial);
  for (const arm of [top.left, top.right]) {
    arm.elevationDeg = parameters.topAngleDeg;
    arm.elbowFlexionDeg = 20;
  }
  function commands(from: UpperBodyPose, to: UpperBodyPose): MovementCommand[] {
    // Preserve the six-command reference, including constant shoulder rotation. New channels
    // retain their neutral values rather than expanding the shared protocol's group limit.
    return upperBodyControls.filter((binding) => /^(left|right)_(shoulder_elevation|elbow_flexion|shoulder_external_rotation)$/.test(binding.id))
      .map((binding) => ({ componentId: binding.id, parameters: { fromDeg: binding.read(from), toDeg: binding.read(to) } }));
  }
  return { id, steps: [
    { parallel: commands(initial, top), durationSeconds: parameters.travelSeconds, holdSeconds: parameters.holdSeconds },
    { parallel: commands(top, initial), durationSeconds: parameters.travelSeconds, holdSeconds: 0 },
  ] };
}

/** Development pose round-trip through the same validator used for external sequences. */
export function createUpperBodyPoseReference(target: UpperBodyPose, id: string): MovementSequence {
  const error = upperBodyPoseError(target);
  if (error) throw new Error(error);
  const initial = initialUpperBodyPose();
  const changed = upperBodyControls.filter((control) => control.read(target) !== control.read(initial));
  if (changed.length === 0) throw new Error('Change an angle before playing the pose.');
  if (changed.length > 12) throw new Error('Play up to 12 changed channels together; reset some angles first.');
  const commands = (from: UpperBodyPose, to: UpperBodyPose) => changed.map((control) => ({
    componentId: control.id, parameters: { fromDeg: control.read(from), toDeg: control.read(to) },
  }));
  const sequence: MovementSequence = { id, steps: [
    { parallel: commands(initial, target), durationSeconds: 3, holdSeconds: 1 },
    { parallel: commands(target, initial), durationSeconds: 3, holdSeconds: 0 },
  ] };
  compileUpperBodySequence(sequence);
  return sequence;
}

/** Emits only boundaries/status changes; updatedAt is a phase-entry time. */
export function createPlaybackReporter(sequenceId: string, emit: (state: PlaybackState) => void) {
  let previous = '';
  return (stepIndex: number, phase: PlaybackState['phase'], status: PlaybackState['status'], now: number) => {
    const key = `${stepIndex}:${phase}:${status}`;
    if (key === previous) return;
    previous = key;
    emit({ sequenceId, stepIndex, phase, status, updatedAt: now });
  };
}
