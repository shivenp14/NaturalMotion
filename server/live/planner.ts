import { generateAgentReturn, type AgentServiceOptions } from '../agent';
import type { MovementPlan } from './ToolController';
import type { MovementSequence } from '../../src/shared/contracts';
import { compileUpperBodySequence } from '../../src/anatomy/upperBodySequence';

export async function planMovement(options: AgentServiceOptions, utterance: string, interpretation: string,
  currentSequence: MovementSequence | null, signal: AbortSignal): Promise<MovementPlan> {
  const reply = await generateAgentReturn({ utterance: JSON.stringify({ USER_UTTERANCE: utterance,
    conversationInterpretation: interpretation }), currentSequence, catalog: options.catalog ?? [] },
  { ...options, plannerOnly: true, allowPlaybackEdits: false }, signal);
  const movement = reply.actions.find(action => action.type === 'play_sequence');
  const message = reply.actions.filter(action => action.type === 'speak_text').map(action => action.text).join(' ');
  if (movement?.type !== 'play_sequence') return { sequence: null, message };
  compileUpperBodySequence(movement.sequence);
  return { sequence: movement.sequence, message };
}
