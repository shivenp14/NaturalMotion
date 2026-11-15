import type { ComponentDefinition, MovementSequence, MovementStep } from './contracts';

/** Candidate first component only; animation and check must be proven on the phone. */
export const MOVEMENT_CATALOG: Record<string, ComponentDefinition> = {
  overhead_reach: {
    id: 'overhead_reach',
    name: 'Gentle overhead reach',
    description: 'A supported upper-body mobility demonstration for desk-break education.',
    enabled: true,
    supportedParameters: {
      speeds: ['slow', 'normal'],
      sides: ['both'],
      repetitions: { min: 1, max: 3, default: 2 },
      holdSeconds: { min: 0, max: 5, default: 2 },
    },
    animationId: 'overhead_reach_v1',
    cameraView: 'front',
    // Heatsy group names; educational *association*, not observed activation.
    muscleHighlights: [
      { groupId: 'shoulders', role: 'associated' },
      { groupId: 'upper_back', role: 'associated' },
    ],
    formChecks: [{
      checkId: 'torso_alignment',
      requiredLandmarks: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],
      correctionCueId: 'torso_center',
      repositionCueId: 'camera_reposition',
      acknowledgmentCueId: 'alignment_improved',
    }],
  },
};

/** Approved spoken cues. Adjust text with your team; not medical diagnoses or treatment. */
export const CUE_CATALOG: Record<string, string> = {
  torso_center: 'Your torso appears to be leaning to one side. Try returning toward the center without forcing the reach.',
  camera_reposition: 'I cannot see the landmarks I need. Please adjust your position so your shoulders and hips are visible.',
  alignment_improved: 'That looks closer to the reference position. Nice adjustment.',
  introduction: 'I can show a gentle upper-body movement and compare a few visible positions. Stop if it hurts.',
  unsupported: 'I cannot demonstrate that movement yet. I can show our supported upper-body movement instead.',
};

export function validateSequence(input: MovementSequence): { valid: true; value: MovementSequence } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input.sequenceId !== 'string' || !Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 3) {
    return { valid: false, errors: ['Expected sequenceId and 1–3 steps'] };
  }
  const ids = new Set<string>();
  for (const step of input.steps) {
    if (!step || typeof step.stepId !== 'string' || ids.has(step.stepId)) { errors.push('stepId must be unique'); continue; }
    ids.add(step.stepId);
    const component = MOVEMENT_CATALOG[step.componentId];
    if (!component?.enabled) { errors.push(`Unsupported component: ${step.componentId}`); continue; }
    const p = step.parameters;
    const a = component.supportedParameters;
    if (!p || !a.speeds.includes(p.speed)) errors.push(`Unsupported speed for ${step.stepId}`);
    if (!p || !a.sides.includes(p.side)) errors.push(`Unsupported side for ${step.stepId}`);
    if (!p || !Number.isInteger(p.repetitions) || p.repetitions < a.repetitions.min || p.repetitions > a.repetitions.max) errors.push(`Invalid repetitions for ${step.stepId}`);
    if (!p || !Number.isInteger(p.holdSeconds) || p.holdSeconds < a.holdSeconds.min || p.holdSeconds > a.holdSeconds.max) errors.push(`Invalid holdSeconds for ${step.stepId}`);
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: input };
}

export function defaultStep(stepId = 'step_1'): MovementStep {
  const c = MOVEMENT_CATALOG.overhead_reach;
  return { stepId, componentId: c.id, parameters: {
    speed: 'normal', side: 'both', repetitions: c.supportedParameters.repetitions.default,
    holdSeconds: c.supportedParameters.holdSeconds.default,
  } };
}
