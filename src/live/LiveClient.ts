import { isRecord } from '../shared/validation';
import type { LiveAction, LiveClientMessage, LiveServerMessage } from './protocol';

type Socket = Pick<WebSocket, 'send' | 'close' | 'readyState' | 'bufferedAmount' | 'onopen' | 'onclose' | 'onerror' | 'onmessage'>;
export type LiveClientOptions = {
  baseUrl: string;
  socketFactory?: (url: string) => Socket;
  now?: () => number;
  context: Extract<LiveClientMessage, { type: 'context' }>;
  apply(action: LiveAction): void;
  onMessage(message: LiveServerMessage): void;
  onClose(message: string): void;
};

export class LiveClient {
  private socket: Socket | null = null;
  private active = false;
  private ready = false;
  private applied = new Set<string>();
  private cancelled = new Set<string>();
  private rejectStart: ((error: Error) => void) | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingContext: Extract<LiveClientMessage, { type: 'context' }> | null = null;
  private clockSentAt: number | null = null;
  private clockOffset: number | null = null;
  private clockUncertainty = 0;
  constructor(private readonly options: LiveClientOptions) {}
  private now() { return this.options.now?.() ?? Date.now(); }
  start(): Promise<void> {
    if (this.active) return Promise.reject(new Error('Live session is already started.'));
    const url = new URL(this.options.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Expected a backend HTTP(S) URL.');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.pathname = `${url.pathname.replace(/\/$/, '')}/live`;
    this.active = true;
    const socket = this.options.socketFactory?.(url.href) ?? new WebSocket(url.href);
    this.socket = socket;
    return new Promise((resolve, reject) => {
      this.rejectStart = reject;
      const timer = setTimeout(() => fail('Live connection timed out.'), 15000);
      this.startTimer = timer;
      const fail = (message: string) => {
        if (!this.active) return;
        clearTimeout(timer); this.stop(); this.options.onClose(message); reject(new Error(message));
      };
      socket.onopen = () => {
        this.clockSentAt = this.now();
        this.send({ type: 'clock', clientSentAt: this.clockSentAt }, true);
      };
      socket.onerror = () => fail('Could not reach the live backend.');
      socket.onclose = () => fail('Live connection closed.');
      socket.onmessage = event => {
        if (!this.active) return;
        try {
          const input: unknown = JSON.parse(String(event.data));
          if (!isRecord(input) || typeof input.type !== 'string') throw new Error('Invalid live response.');
          if (input.type === 'error') { fail(typeof input.message === 'string' ? input.message : 'Live backend failed.'); return; }
          if (input.type === 'clock') {
            const receivedAt = this.now();
            if (this.clockOffset !== null || this.clockSentAt === null || input.clientSentAt !== this.clockSentAt ||
              typeof input.serverNow !== 'number' || !Number.isFinite(input.serverNow) ||
              receivedAt < this.clockSentAt || receivedAt - this.clockSentAt > 2000) throw new Error('Clock synchronization failed.');
            // Midpoint estimate bounds uncertainty to half the measured round trip.
            // Preserve server-owned absolute action expiry, including time spent in transit.
            this.clockOffset = input.serverNow - (this.clockSentAt + receivedAt) / 2;
            this.clockUncertainty = (receivedAt - this.clockSentAt) / 2;
            this.send(this.options.context, true);
            return;
          }
          if (input.type === 'ready') {
            if (this.clockOffset === null) throw new Error('Clock synchronization is required.');
            this.ready = true; clearTimeout(timer); this.rejectStart = null;
            const pending = this.pendingContext; this.pendingContext = null;
            if (pending) this.send(pending);
            resolve();
          }
          if (input.type === 'cancel' && typeof input.commandId === 'string') this.cancelled.add(input.commandId);
          if (input.type === 'action') {
            if (!this.ready) throw new Error('Live action arrived before initialization.');
            if (typeof input.commandId !== 'string' || !isRecord(input.action) ||
              typeof input.expiresAt !== 'number' || !Number.isFinite(input.expiresAt)) throw new Error('Invalid live action.');
            const isControl = ['pause_movement', 'resume_movement', 'stop_movement'].includes(String(input.action.type));
            if (this.applied.size >= 128 && !isControl) throw new Error('Live action limit reached.');
            const commandId = input.commandId;
            if (this.applied.has(commandId)) { this.send({ type: 'applied', commandId, ok: true }); return; }
            // Use the upper bound: asymmetric transit may make the midpoint
            // estimate lag the server, and cancellation can still be in flight.
            if (this.cancelled.has(commandId) || this.clockOffset === null ||
              this.now() + this.clockOffset + this.clockUncertainty >= input.expiresAt) { this.send({ type: 'applied', commandId, ok: false }); return; }
            let ok = false;
            try {
              this.options.apply(input.action as LiveAction);
              if (this.applied.size < 128) this.applied.add(commandId);
              ok = true;
            } catch { /* Reject before acknowledging application. */ }
            this.send({ type: 'applied', commandId, ok });
          }
          this.options.onMessage(input as LiveServerMessage);
        } catch { fail('The live response could not be processed.'); }
      };
    });
  }
  send(message: LiveClientMessage, initializing = false) {
    if (!this.active) return;
    if (!this.ready && !initializing) { if (message.type === 'context') this.pendingContext = message; return; }
    if (this.socket?.readyState !== 1) return;
    if (this.socket.bufferedAmount > 256000) { this.stop(); this.options.onClose('Network cannot keep up with live media. Restart the session.'); return; }
    // Domain timestamps remain device-local. Only the wire representation uses
    // the calibrated backend clock, for both media freshness and practice context.
    const offset = this.clockOffset ?? 0;
    let wire = message;
    if (message.type === 'image') wire = { ...message, observedAt: message.observedAt + offset };
    if (message.type === 'form') wire = { ...message, report: { ...message.report, observedAt: message.report.observedAt + offset } };
    if (message.type === 'context') wire = { ...message,
      playback: message.playback ? { ...message.playback, updatedAt: message.playback.updatedAt + offset } : null,
      ...(typeof message.practiceStartedAt === 'number' ? { practiceStartedAt: message.practiceStartedAt + offset } : {}) };
    this.socket.send(JSON.stringify(wire));
  }
  stop() {
    this.active = false; this.ready = false;
    this.pendingContext = null;
    this.clockSentAt = null; this.clockOffset = null; this.clockUncertainty = 0;
    if (this.startTimer) clearTimeout(this.startTimer); this.startTimer = null;
    this.rejectStart?.(new Error('Live session cancelled.')); this.rejectStart = null;
    const socket = this.socket; this.socket = null;
    if (socket) { socket.onmessage = null; socket.onclose = null; socket.onerror = null; socket.onopen = null; socket.close(); }
  }
}
