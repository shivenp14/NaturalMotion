import type { ComponentDefinition, MovementSequence, MovementStep } from './contracts';

export type SequenceValidation =
  | { ok: true; sequence: MovementSequence }
  | { ok: false; error: string };

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
  for (const step of input.steps) {
    if (!isRecord(step) || !isId(step.componentId) || !isRecord(step.parameters) ||
      !hasOnlyKeys(step, ['componentId', 'parameters'])) {
      return fail('Invalid movement step.');
    }
    const component = catalog.find((item) => item.id === step.componentId);
    if (!component) return fail(`Unsupported component: ${step.componentId}`);
    const keys = Object.keys(component.parameters);
    if (Object.keys(step.parameters).length !== keys.length ||
      !hasOnlyKeys(step.parameters, keys)) return fail('Parameters do not match the component.');
    const parameters: Record<string, number> = {};
    for (const key of keys) {
      const value = step.parameters[key];
      const limit = component.parameters[key];
      if (typeof value !== 'number' || !Number.isFinite(value) ||
        value < limit.minimum || value > limit.maximum ||
        (limit.integer && !Number.isInteger(value))) return fail(`Invalid parameter: ${key}`);
      parameters[key] = value;
    }
    steps.push({ componentId: component.id, parameters });
  }
  return { ok: true, sequence: { id: input.id, steps } };
}
