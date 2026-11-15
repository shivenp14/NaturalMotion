import type { AgentAdapter, AgentRequest, AgentAction } from '../agent/types';
import { validateAgentReturn } from '../agent/validateAgentReturn';
import type { MovementSequence, SessionPhase } from '../shared/contracts';
import type { CompositionPolicy } from '../shared/validateSequence';
import type { ListenEnd, VoiceAdapter } from './types';

export type TurnContext = Omit<AgentRequest, 'utterance'> & { cues?: Readonly<Record<string, string>> };
export type PlaybackAction = Extract<AgentAction, { type: 'modify_playback' | 'replay_demonstration' | 'pause_session' | 'stop_session' }>;
export type TurnCoordinatorOptions = {
  voice: VoiceAdapter;
  agent: AgentAdapter;
  getContext(): TurnContext;
  onPhase(phase: SessionPhase): void;
  /** Called once for each accepted final transcript. */
  onTranscript?(text: string): void;
  /** Called immediately before each validated text/cue is spoken. */
  onSpokenText?(text: string): void;
  onSequence(sequence: MovementSequence): void;
  /** Required when the agent returns movement/session controls. Must synchronously dispatch. */
  onPlaybackAction?(action: PlaybackAction): void;
  onError?(error: unknown): void;
  silenceRetryDelayMs?: number;
  compositionPolicy?: CompositionPolicy;
};

/** One final transcript per turn; recognition stays stopped through generation and speech. */
export class TurnCoordinator {
  private active = false;
  private generation = 0;
  private currentRequest: AbortController | null = null;
  private silenceCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopping: Promise<void> = Promise.resolve();

  constructor(private readonly options: TurnCoordinatorOptions) {}

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    const generation = ++this.generation;
    this.silenceCount = 0;
    try {
      await this.stopping;
      if (this.isCurrent(generation)) await this.resumeListening(generation);
    } catch (error) { await this.fail(error, generation); }
  }

  async stop(): Promise<void> {
    this.active = false;
    ++this.generation;
    this.clearRetry();
    this.currentRequest?.abort();
    this.currentRequest = null;
    this.options.onPhase('idle');
    const stopping = this.options.voice.stop();
    this.stopping = stopping;
    // Keep a rejection handler even if a caller chooses not to await stop.
    void stopping.catch(() => {});
    await stopping;
  }

  private isCurrent(generation: number) { return this.active && generation === this.generation; }
  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
  private async fail(error: unknown, generation: number) {
    if (!this.isCurrent(generation)) return;
    try { await this.stop(); }
    catch (stopError) { this.options.onError?.(stopError); }
    this.options.onError?.(error);
  }
  private handleListenEnd(event: ListenEnd, generation: number) {
    if (!this.isCurrent(generation) || this.currentRequest) return;
    if (event.reason === 'error') { void this.fail(event.error, generation); return; }
    if (++this.silenceCount > 4) {
      void this.fail(new Error('Speech recognition repeatedly ended without hearing a request.'), generation);
      return;
    }
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.isCurrent(generation)) void this.resumeListening(generation);
    }, Math.min(this.silenceCount * (this.options.silenceRetryDelayMs ?? 500), 2000));
  }
  private async resumeListening(generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return;
    this.options.onPhase('listening');
    try {
      await this.options.voice.listen(
        text => { void this.handleUtterance(text, generation); },
        event => this.handleListenEnd(event, generation),
      );
    } catch (error) { await this.fail(error, generation); }
  }
  private async handleUtterance(utterance: string, generation: number): Promise<void> {
    const text = utterance.trim();
    if (!text || this.currentRequest || !this.isCurrent(generation)) return;
    this.clearRetry();
    this.silenceCount = 0;
    this.options.onTranscript?.(text);
    const controller = new AbortController();
    this.currentRequest = controller;
    try {
      await this.options.voice.stop();
      if (!this.isCurrent(generation)) return;
      this.options.onPhase('thinking');
      const context = this.options.getContext();
      const reply = await this.options.agent.respond({ utterance: text, ...context }, controller.signal);
      if (!this.isCurrent(generation)) return;
      const checked = validateAgentReturn(reply, { ...context, cues: context.cues ?? {},
        compositionPolicy: this.options.compositionPolicy });
      if (!checked.ok) throw new Error(checked.error);
      if (checked.value.trigger.type !== 'user_utterance') throw new Error('Expected a user utterance response.');
      // Reject unsupported dispatch before any part of the batch executes.
      if (!this.options.onPlaybackAction && checked.value.actions.some(action =>
        ['modify_playback', 'replay_demonstration', 'pause_session', 'stop_session'].includes(action.type))) {
        throw new Error('Playback controls are not connected.');
      }
      for (const action of checked.value.actions) {
        if (!this.isCurrent(generation)) return;
        switch (action.type) {
          case 'speak_text':
          case 'speak_cue':
            {
              const spokenText = action.type === 'speak_text' ? action.text : context.cues![action.cueId];
              this.options.onSpokenText?.(spokenText);
              this.options.onPhase('speaking');
              await this.options.voice.speak(spokenText);
            }
            break;
          case 'play_sequence': this.options.onSequence(action.sequence); break;
          case 'modify_playback':
          case 'replay_demonstration': this.options.onPlaybackAction!(action); break;
          case 'pause_session':
          case 'stop_session':
            this.options.onPlaybackAction!(action);
            await this.stop();
            return;
          case 'no_action': break;
        }
      }
    } catch (error) {
      await this.fail(error, generation);
    } finally {
      // A cancelled request must never clear a newer request or restart its microphone.
      if (this.currentRequest === controller) this.currentRequest = null;
      if (this.isCurrent(generation)) await this.resumeListening(generation);
    }
  }
}
