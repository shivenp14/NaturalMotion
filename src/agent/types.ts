import type { ComponentDefinition, FormEvent, MovementSequence } from '../shared/contracts';

export type AgentRequest = {
  utterance: string;
  catalog: readonly ComponentDefinition[];
  currentSequence: MovementSequence | null;
  observation?: FormEvent;
};

/** Person 3: untrusted sequence data must pass acceptSequence before playback. */
export interface AgentAdapter {
  respond(request: AgentRequest, signal?: AbortSignal): Promise<{
    speech: string;
    sequence?: unknown;
  }>;
}
