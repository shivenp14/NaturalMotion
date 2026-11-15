import type { MovementSequence } from '../../src/shared/contracts';
import type { LiveAction } from '../../src/live/protocol';
import { hasOnlyKeys, isRecord } from '../../src/shared/validation';

export type ToolResult = { ok: boolean; message: string; sequenceId?: string };
type ToolCall = { id?: string; name?: string; args?: unknown };
export type MovementPlan = { sequence: MovementSequence | null; message: string };
type Options = {
  plan(utterance: string, interpretation: string, current: MovementSequence | null, signal: AbortSignal): Promise<MovementPlan>;
  apply(action: LiveAction, signal: AbortSignal): Promise<void>;
  onPlanning(active: boolean): void;
  onPlanStarted?(callId: string): void;
};

/** Server-owned action limits. Seeing another camera frame never creates a planning budget. */
export class ToolController {
  private sequence: MovementSequence | null = null;
  private utterance = '';
  private inputOpen = false;
  private awaitingInput = true;
  private usedPlan = false;
  private generation = 0;
  private active: { id: string; abort: AbortController } | null = null;
  private calls = new Map<string, Promise<ToolResult>>();
  private requestsThisTurn = 0;
  private closed = false;
  private speechBoundaries = false;
  private inputWaiters = new Set<() => void>();
  private waiting = new Map<string, { cancelled: boolean }>();
  constructor(private readonly options: Options) {}
  get currentSequence() { return this.sequence; }
  setSequence(sequence: MovementSequence | null) { this.sequence = sequence; }
  beginSpeech() {
    this.speechBoundaries = true;
    if (this.inputOpen && this.utterance && !this.usedPlan) return;
    this.beginTurn(!this.utterance && this.waiting.size > 0);
  }
  endSpeech() { this.inputOpen = false; this.wakeInput(); }
  private wakeInput() { for (const resolve of this.inputWaiters) resolve(); this.inputWaiters.clear(); }
  private beginTurn(preserveWaiting = false) {
    if (!preserveWaiting) this.cancel();
    this.utterance = ''; this.usedPlan = false; this.requestsThisTurn = 0;
    this.awaitingInput = false; this.inputOpen = true;
  }
  noteTextInput(text: string) { this.beginTurn(); this.noteInput(text, true); }
  noteInput(text: string, finished = false) {
    if (!text.trim()) { if (finished) { this.inputOpen = false; this.wakeInput(); } return; }
    if (!this.speechBoundaries && this.awaitingInput && !this.inputOpen) this.beginTurn(!this.utterance && this.waiting.size > 0);
    this.utterance = `${this.utterance}${text}`.slice(-4000);
    if (finished) this.inputOpen = false;
    this.wakeInput();
  }
  finishTurn() { if (!this.speechBoundaries) { this.awaitingInput = true; this.wakeInput(); } }
  interrupt() { this.cancel(); this.inputOpen = false; this.awaitingInput = true; }
  cancel(id?: string) {
    if (id) {
      const waiting = this.waiting.get(id);
      if (waiting) { waiting.cancelled = true; this.wakeInput(); }
      if (this.active?.id !== id) return;
    } else {
      for (const waiting of this.waiting.values()) waiting.cancelled = true;
      this.wakeInput();
    }
    this.generation++;
    this.active?.abort.abort(); this.active = null;
    this.options.onPlanning(false);
  }
  close() { this.closed = true; this.cancel(); for (const resolve of this.inputWaiters) resolve(); this.inputWaiters.clear(); }
  async control(name: 'pause_movement' | 'resume_movement' | 'stop_movement'): Promise<ToolResult> {
    if (this.closed) return { ok: false, message: 'Session is closed.' };
    this.cancel();
    await this.options.apply({ type: name }, new AbortController().signal);
    if (name === 'stop_movement') this.sequence = null;
    return { ok: true, message: name === 'stop_movement' ? 'Movement cleared.' : name === 'pause_movement' ? 'Movement paused.' : 'Movement resumed.' };
  }
  handle(call: ToolCall): Promise<ToolResult> {
    if (typeof call.id !== 'string' || !call.id || call.id.length > 128) return Promise.resolve({ ok: false, message: 'Missing valid tool call ID.' });
    const previous = this.calls.get(call.id);
    if (previous) return previous;
    const isControl = ['pause_movement', 'resume_movement', 'stop_movement'].includes(call.name ?? '');
    if (this.calls.size >= 128 && !isControl) return Promise.resolve({ ok: false, message: 'Session tool limit reached. Start a new session.' });
    const result = this.run(call).catch(() => ({ ok: false, message: 'Action failed or was cancelled. No success is confirmed.' }));
    if (this.calls.size < 128) this.calls.set(call.id, result);
    return result;
  }
  private async run(call: ToolCall): Promise<ToolResult> {
    if (this.closed) return { ok: false, message: 'Session is closed.' };
    if (call.name === 'pause_movement' || call.name === 'resume_movement' || call.name === 'stop_movement') {
      if (call.args !== undefined && (!isRecord(call.args) || !hasOnlyKeys(call.args, []))) return { ok: false, message: 'Unexpected control arguments.' };
      return this.control(call.name);
    }
    if (call.name !== 'request_movement' || !isRecord(call.args) || !hasOnlyKeys(call.args, ['request']) ||
      typeof call.args.request !== 'string' || !call.args.request.trim() || call.args.request.length > 2000) {
      return { ok: false, message: 'Unknown tool or invalid movement request.' };
    }
    if (++this.requestsThisTurn > 3) return { ok: false, message: 'Tool request limit reached. Wait for the user; do not retry.' };
    // The provider documents transcription and function calls as independently ordered streams.
    // Briefly wait for actual user text instead of inventing an utterance from camera context.
    const waiting = { cancelled: false }; this.waiting.set(call.id!, waiting);
    const deadline = Date.now() + 1000;
    try {
      while (!this.closed && !waiting.cancelled && (this.inputOpen || !this.utterance.trim()) && Date.now() < deadline) {
        await new Promise<void>(resolve => {
          const done = () => { clearTimeout(timer); this.inputWaiters.delete(done); resolve(); };
          const timer = setTimeout(done, Math.max(1, deadline - Date.now())); this.inputWaiters.add(done);
        });
      }
      if (waiting.cancelled) return { ok: false, message: 'Request was cancelled before transcription completed.' };
      if (this.inputOpen) return { ok: false, message: 'A complete user request was not received. Ask the user to repeat it.' };
    } finally { this.waiting.delete(call.id!); }
    if (this.closed) return { ok: false, message: 'Session is closed.' };
    if (!this.utterance.trim() || this.usedPlan || this.active) {
      return { ok: false, message: 'At most one movement plan per user turn. Wait for a new user request; do not retry.' };
    }
    this.usedPlan = true;
    const generation = this.generation;
    const abort = new AbortController();
    this.active = { id: call.id!, abort };
    const timeout = setTimeout(() => abort.abort(), 25000);
    this.options.onPlanning(true);
    try {
      this.options.onPlanStarted?.(call.id!);
      const plan = await this.options.plan(this.utterance, call.args.request, this.sequence, abort.signal);
      if (abort.signal.aborted || generation !== this.generation || this.closed) return { ok: false, message: 'Planning was cancelled.' };
      if (!plan.sequence) return { ok: false, message: plan.message || 'No supported demonstration was generated.' };
      await this.options.apply({ type: 'play_sequence', sequence: plan.sequence }, abort.signal);
      if (abort.signal.aborted || generation !== this.generation || this.closed) return { ok: false, message: 'Application was cancelled.' };
      this.sequence = plan.sequence;
      return { ok: true, sequenceId: plan.sequence.id, message: plan.message || 'Validated demonstration accepted by the app.' };
    } finally {
      clearTimeout(timeout);
      if (this.active?.abort === abort) { this.active = null; this.options.onPlanning(false); }
    }
  }
}
