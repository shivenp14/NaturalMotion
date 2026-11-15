import type { ComponentDefinition, MovementCommand, MovementSequence, MovementStep } from './contracts';

export type SequenceValidation =
  | { ok: true; sequence: MovementSequence }
  | { ok: false; error: string };

/** Trusted renderer-owned policy: joint bounds alone do not validate a motion. */
export type CompositionPolicy = (sequence: MovementSequence) => string | null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

/** Validate untrusted agent output before sending anything to the renderer. */
export function validateSequence(
  input: unknown,
  catalog: readonly ComponentDefinition[],
  compositionPolicy?: CompositionPolicy,
): SequenceValidation {
  const fail = (error: string): SequenceValidation => ({ ok: false, error });
  if (!isRecord(input) || !isId(input.id) || !hasOnlyKeys(input, ['id', 'steps'])) {
    return fail('Expected a sequence with an id and steps.');
  }
  // Resource limit, not an exercise recommendation.
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 32) {
    return fail('A sequence must contain 1–32 steps.');
  }
  const steps: MovementStep[] = [];
  let hasParallelStep = false;
  for (const step of input.steps) {
    if (!isRecord(step)) return fail('Invalid movement step.');
    const parallel = 'parallel' in step;
    let commands: unknown[];
    if (parallel) {
      hasParallelStep = true;
      if (!hasOnlyKeys(step, ['parallel', 'durationSeconds', 'holdSeconds']) ||
        !Array.isArray(step.parallel) || step.parallel.length < 1 || step.parallel.length > 12 ||
        typeof step.durationSeconds !== 'number' || !Number.isFinite(step.durationSeconds) || step.durationSeconds < 0.25 || step.durationSeconds > 30 ||
        typeof step.holdSeconds !== 'number' || !Number.isFinite(step.holdSeconds) || step.holdSeconds < 0 || step.holdSeconds > 10) {
        return fail('Invalid simultaneous movement group.');
      }
      commands = step.parallel;
    } else commands = [step];
    const validated: MovementCommand[] = [];
    const writtenChannels = new Set<string>();
    for (const command of commands) {
      if (!isRecord(command) || !isId(command.componentId) || !isRecord(command.parameters) ||
        !hasOnlyKeys(command, ['componentId', 'parameters'])) return fail('Invalid movement command.');
      const component = catalog.find((item) => item.id === command.componentId);
      if (!component) return fail(`Unsupported component: ${command.componentId}`);
      if (parallel) {
        if (!component.controlledChannels?.length) return fail('Parallel components must declare controlled channels.');
        for (const channel of component.controlledChannels) {
          if (writtenChannels.has(channel)) return fail(`Conflicting movement channel: ${channel}`);
          writtenChannels.add(channel);
        }
      }
      const keys = Object.keys(component.parameters);
      if (Object.keys(command.parameters).length !== keys.length ||
        !hasOnlyKeys(command.parameters, keys)) return fail('Parameters do not match the component.');
      const parameters: Record<string, number> = {};
      for (const key of keys) {
        const value = command.parameters[key];
        const limit = component.parameters[key];
        if (typeof value !== 'number' || !Number.isFinite(value) ||
          value < limit.minimum || value > limit.maximum ||
          (limit.integer && !Number.isInteger(value))) return fail(`Invalid parameter: ${key}`);
        parameters[key] = value;
      }
      validated.push({ componentId: component.id, parameters });
    }
    if (parallel) {
      steps.push({ parallel: validated, durationSeconds: step.durationSeconds as number, holdSeconds: step.holdSeconds as number });
    } else steps.push(validated[0]);
  }
  if (hasParallelStep && !compositionPolicy) return fail('Simultaneous movement execution is not configured.');
  const sequence: MovementSequence = { id: input.id, steps };
  if (compositionPolicy) {
    try {
      const error = compositionPolicy(sequence);
      if (error !== null) return fail(typeof error === 'string' && error ? error : 'Composition policy rejected the sequence.');
    } catch {
      return fail('Composition policy could not validate the sequence.');
    }
  }
  return { ok: true, sequence };
}
