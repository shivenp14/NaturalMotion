import type { ComponentDefinition, MovementSequence } from '../shared/contracts';
import { validateSequence } from '../shared/validateSequence';

export type ParsedPlan =
  | { ok: true; speech: string; sequence?: MovementSequence }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Convert model output into the existing MovementSequence protocol.
 * Neither a JSON schema nor a language model can establish that an
 * animation exists: the verified component catalog is authoritative.
 */
export function parseMovementPlan(
  raw: unknown,
  catalog: readonly ComponentDefinition[],
  sequenceId: string,
): ParsedPlan {
  if (!isRecord(raw) || typeof raw.speech !== 'string' ||
      !raw.speech.trim() || raw.speech.length > 600 ||
      !Array.isArray(raw.steps) || raw.steps.length > 8) {
    return { ok: false, error: 'Invalid agent response shape.' };
  }
  if (raw.steps.length === 0) {
    return { ok: true, speech: raw.speech.trim() };
  }
  if (!sequenceId.trim()) return { ok: false, error: 'Missing sequence ID.' };

  const steps: MovementSequence['steps'] = [];
  for (const rawStep of raw.steps) {
    if (!isRecord(rawStep) || typeof rawStep.componentId !== 'string' ||
        !Array.isArray(rawStep.parameters) || rawStep.parameters.length > 16) {
      return { ok: false, error: 'Invalid movement step.' };
    }
    const parameters: Record<string, number> = {};
    for (const item of rawStep.parameters) {
      if (!isRecord(item) || typeof item.name !== 'string' ||
          typeof item.value !== 'number' || !Number.isFinite(item.value) ||
          Object.prototype.hasOwnProperty.call(parameters, item.name)) {
        return { ok: false, error: 'Invalid or duplicated movement parameter.' };
      }
      parameters[item.name] = item.value;
    }
    steps.push({ componentId: rawStep.componentId, parameters });
  }
  const validation = validateSequence({ id: sequenceId, steps }, catalog);
  if (!validation.ok) return { ok: false, error: validation.error };
  return { ok: true, speech: raw.speech.trim(), sequence: validation.sequence };
}

/** Create only the affordances the rig can execute; no fake movement IDs. */
export function describeCatalog(catalog: readonly ComponentDefinition[]): string {
  if (catalog.length === 0) return 'No movements are implemented yet.';
  return catalog.map((component) => {
    const parameters = Object.entries(component.parameters)
      .map(([name, rule]) => `${name}: ${rule.minimum}..${rule.maximum}${rule.integer ? ' (integer)' : ''}`)
      .join(', ');
    return `ID: ${component.id}; name: ${component.label}; parameters: ${parameters}; camera: ${component.cameraView}`;
  }).join('\n');
}
