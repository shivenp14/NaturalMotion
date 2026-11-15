import type { AgentServiceOptions } from './agent';

/** Unknown model overrides omit reasoning unless the operator explicitly selects it. */
export function resolveReasoningEffort(model: string, setting?: string): AgentServiceOptions['reasoningEffort'] {
  if (setting === 'omit') return undefined;
  if (setting === undefined) return model.startsWith('gpt-6') ? 'low' : undefined;
  if (setting === 'none' || setting === 'low' || setting === 'medium') return setting;
  throw new Error('OPENAI_REASONING_EFFORT must be none, low, medium or omit.');
}
