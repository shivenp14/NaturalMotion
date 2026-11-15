import { hasPracticeCompletionCue } from './practiceCompletion';
import type { MovementSequence } from '../../src/shared/contracts';
import type { AssessmentPlan } from '../../src/shared/assessment';
import type { LiveAction } from '../../src/live/protocol';
import { hasOnlyKeys, isRecord } from '../../src/shared/validation';
import { avatarViewLabels, isAvatarViewPreference, type PresentationPlan } from '../../src/shared/presentation';

export type ToolResult = { ok: boolean; message: string; sequenceId?: string };
type ToolCall = { id?: string; name?: string; args?: unknown };
export type MovementPlan = { sequence: MovementSequence | null; message: string; assessmentPlan?: AssessmentPlan | null; presentationPlan?: PresentationPlan | null };
type Options = {
  plan(utterance: string, interpretation: string, current: MovementSequence | null, signal: AbortSignal): Promise<MovementPlan>;
  apply(action: LiveAction, signal: AbortSignal): Promise<void>;
  onPlanning(active: boolean): void;
};

/** Server-owned action limits. Seeing another camera frame never creates a planning budget. */
export class ToolController {
  private sequence: MovementSequence | null = null;
  private assessment: AssessmentPlan | null = null;
  private utterance = '';
  private inputOpen = false;
  private awaitingInput = true;
  private usedPlan = false;
  private generation = 0;
  private active: { id: string; abort: AbortController } | null = null;
  private calls = new Map<string, Promise<ToolResult>>();
  private requestsThisTurn = 0;
  private usedView = false;
  private usedPractice = false;
  private closed = false;
  private speechBoundaries = false;
  private inputWaiters = new Set<() => void>();
  private waiting = new Map<string, { cancelled: boolean }>();
  constructor(private readonly options: Options) {}
  get currentSequence() { return this.sequence; }
  get currentAssessment() { return this.assessment; }
  get isUserSpeaking() { return this.inputOpen; }
  setSequence(sequence: MovementSequence | null) {
    // Identical accepted context retains its compiled assessment cache.
    if (this.assessment && sequence?.id === this.sequence?.id) return;
    if (sequence?.id !== this.sequence?.id) this.assessment = null;
    this.sequence = sequence;
  }
  beginSpeech() {
    this.speechBoundaries = true;
    if (this.inputOpen && this.utterance && !this.usedPlan) return;
    this.beginTurn(!this.utterance && this.waiting.size > 0);
  }
  endSpeech() { this.inputOpen = false; this.wakeInput(); }
  private wakeInput() { for (const resolve of this.inputWaiters) resolve(); this.inputWaiters.clear(); }
  private beginTurn(preserveWaiting = false) {
    if (!preserveWaiting) this.cancel();
    this.utterance = ''; this.usedPlan = false; this.usedView = false; this.usedPractice = false; this.requestsThisTurn = 0;
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
    if (name === 'stop_movement') { this.sequence = null; this.assessment = null; }
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
  private async waitForInput(id: string): Promise<ToolResult | null> {
    const waiting = { cancelled: false }; this.waiting.set(id, waiting);
    const deadline = Date.now() + 1000;
    try {
      while (!this.closed && !waiting.cancelled && (this.inputOpen || !this.utterance.trim()) && Date.now() < deadline) {
        await new Promise<void>(resolve => {
          const done = () => { clearTimeout(timer); this.inputWaiters.delete(done); resolve(); };
          const timer = setTimeout(done, Math.max(1, deadline - Date.now())); this.inputWaiters.add(done);
        });
      }
      if (waiting.cancelled) return { ok: false, message: 'Request was cancelled before transcription completed.' };
      if (this.closed) return { ok: false, message: 'Session is closed.' };
      if (this.inputOpen || !this.utterance.trim()) return { ok: false, message: 'A complete user request was not received. Ask the user to repeat it.' };
      return null;
    } finally { this.waiting.delete(id); }
  }
  private async run(call: ToolCall): Promise<ToolResult> {
    if (this.closed) return { ok: false, message: 'Session is closed.' };
    if (call.name === 'start_practice' || call.name === 'finish_practice') {
      if (call.args !== undefined && (!isRecord(call.args) || !hasOnlyKeys(call.args, []))) return { ok: false, message: 'Unexpected practice arguments.' };
      const inputError = this.inputOpen || !this.utterance.trim() ? await this.waitForInput(call.id!) : null;
      if (inputError) return inputError;
      if (call.name === 'finish_practice' && !hasPracticeCompletionCue(this.utterance)) return { ok: false, message: 'Wait for the user to say they are done or request a review. Camera context cannot finish practice.' };
      if (!this.sequence || !this.assessment?.checks.length || this.usedPractice) return { ok: false, message: 'No assessable movement or practice request already handled. Wait for a new user request.' };
      this.usedPractice = true;
      await this.options.apply({ type: call.name }, new AbortController().signal);
      return { ok: true, message: call.name === 'start_practice'
        ? 'Practice recording is armed. Stay quiet and let the user perform the whole movement at their own pace. Do not give corrections or invent a form observation.'
        : 'Recording ended. Wait quietly for the application review; do not invent feedback.' };
    }
    if (call.name === 'set_avatar_view') {
      if (!isRecord(call.args) || !hasOnlyKeys(call.args, ['view']) || !isAvatarViewPreference(call.args.view)) return { ok: false, message: 'Unsupported avatar view.' };
      const inputError = this.inputOpen || !this.utterance.trim() ? await this.waitForInput(call.id!) : null;
      if (inputError) return inputError;
      if (this.usedView) return { ok: false, message: 'One view change per completed user request; wait for the user.' };
      this.usedView = true;
      await this.options.apply({ type: 'set_avatar_view', view: call.args.view }, new AbortController().signal);
      return { ok: true, message: call.args.view === 'auto' ? 'Automatic avatar view restored.' : `Avatar is rotating to the ${avatarViewLabels[call.args.view].toLowerCase()} view. Movement continues unchanged.` };
    }
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
    const inputError = this.inputOpen || !this.utterance.trim() ? await this.waitForInput(call.id!) : null;
    if (inputError) return inputError;
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
      const plan = await this.options.plan(this.utterance, call.args.request, this.sequence, abort.signal);
      if (abort.signal.aborted || generation !== this.generation || this.closed) return { ok: false, message: 'Planning was cancelled.' };
      if (!plan.sequence) return { ok: false, message: plan.message || 'No supported demonstration was generated.' };
      await this.options.apply({ type: 'play_sequence', sequence: plan.sequence,
        ...(plan.assessmentPlan ? { assessmentPlan: plan.assessmentPlan } : {}),
        ...(plan.presentationPlan ? { presentationPlan: plan.presentationPlan } : {}) }, abort.signal);
      if (abort.signal.aborted || generation !== this.generation || this.closed) return { ok: false, message: 'Application was cancelled.' };
      this.sequence = plan.sequence;
      this.assessment = plan.assessmentPlan ?? null;
      return { ok: true, sequenceId: plan.sequence.id, message: 'Invite the user to watch the movement on screen. Do not announce readiness or recite technical settings or timings.' };
    } finally {
      clearTimeout(timeout);
      if (this.active?.abort === abort) { this.active = null; this.options.onPlanning(false); }
    }
  }
}
