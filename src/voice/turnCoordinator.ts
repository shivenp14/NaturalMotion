import type { AgentAdapter, AgentRequest } from '../agent/types';
import type { ComponentDefinition, MovementSequence, SessionPhase } from '../shared/contracts';
import { validateSequence } from '../shared/validateSequence';
import type { VoiceAdapter } from './types';

export type TurnContext = Pick<AgentRequest, 'currentSequence' | 'observation'> & {
  catalog: readonly ComponentDefinition[];
};

export type TurnCoordinatorOptions = {
  voice: VoiceAdapter;
  agent: AgentAdapter;
  getContext: () => TurnContext;
  onPhase: (phase: SessionPhase) => void;
  onSequence: (sequence: MovementSequence) => void;
  onError?: (error: unknown) => void;
};

/**
 * Hands-free, half-duplex turn orchestration. Native adapters must make
 * listen() resolve after recording starts and speak() resolve after audio ends.
 * This module does not implement microphone capture or synthesize speech.
 */
export class TurnCoordinator {
  private active = false;
  private busy = false;
  private generation = 0;
  private currentRequest: AbortController | null = null;

  constructor(private readonly options: TurnCoordinatorOptions) {}

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.generation += 1;
    await this.resumeListening(this.generation);
  }

  async stop(): Promise<void> {
    this.active = false;
    this.generation += 1;
    this.currentRequest?.abort();
    this.currentRequest = null;
    await this.options.voice.stop();
    this.options.onPhase('idle');
  }

  private async resumeListening(generation: number): Promise<void> {
    if (!this.active || generation !== this.generation) return;
    this.options.onPhase('listening');
    try {
      await this.options.voice.listen((utterance) => {
        if (this.active && generation === this.generation) {
          void this.handleUtterance(utterance, generation);
        }
      });
    } catch (error) {
      this.options.onError?.(error);
      if (this.active && generation === this.generation) this.options.onPhase('idle');
    }
  }

  private async handleUtterance(utterance: string, generation: number): Promise<void> {
    const text = utterance.trim();
    if (!text || this.busy || !this.active || generation !== this.generation) return;
    this.busy = true;
    const controller = new AbortController();
    this.currentRequest = controller;
    try {
      // Avoid transcribing the assistant's own voice.
      await this.options.voice.stop();
      if (!this.active || generation !== this.generation) return;
      this.options.onPhase('thinking');
      const context = this.options.getContext();
      const reply = await this.options.agent.respond(
        { utterance: text, ...context }, controller.signal,
      );
      if (!this.active || generation !== this.generation) return;
      let speech = reply.speech;
      if (reply.sequence !== undefined) {
        const checked = validateSequence(reply.sequence, context.catalog);
        if (checked.ok) this.options.onSequence(checked.sequence);
        else speech = 'That movement is not available in this version. Please choose a supported movement.';
      }
      this.options.onPhase('speaking');
      await this.options.voice.speak(speech);
    } catch (error) {
      if (this.active && generation === this.generation) {
        this.options.onError?.(error);
        this.options.onPhase('speaking');
        try { await this.options.voice.speak('Sorry, I could not process that. Please try again.'); }
        catch (speechError) { this.options.onError?.(speechError); }
      }
    } finally {
      this.currentRequest = null;
      this.busy = false;
      if (this.active && generation === this.generation) {
        await this.resumeListening(generation);
      }
    }
  }
}
