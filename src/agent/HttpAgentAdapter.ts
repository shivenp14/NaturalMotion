import type { AgentAdapter, AgentRequest } from './types';
import type { CompositionPolicy } from '../shared/validateSequence';
import { validateAgentReturn } from './validateAgentReturn';

export type HttpAgentOptions = {
  baseUrl: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  compositionPolicy?: CompositionPolicy;
};

/** Transcripts and structured context only; provider credentials stay on the backend. */
export class HttpAgentAdapter implements AgentAdapter {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly compositionPolicy?: CompositionPolicy;

  constructor(options: HttpAgentOptions) {
    const base = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new Error('Expected an HTTP(S) backend URL without credentials, query, or fragment.');
    }
    this.endpoint = `${base.href.replace(/\/$/, '')}/agent/respond`;
    this.fetcher = options.fetch ?? fetch;
    this.compositionPolicy = options.compositionPolicy;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async respond(request: AgentRequest, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utterance: request.utterance, catalog: request.catalog,
          currentSequence: request.currentSequence, ...(request.cues ? { cues: request.cues } : {}) }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Agent backend returned HTTP ${response.status}.`);
      const checked = validateAgentReturn(await response.json(), {
        catalog: request.catalog, cues: request.cues ?? {}, currentSequence: request.currentSequence, compositionPolicy: this.compositionPolicy,
      });
      if (!checked.ok) throw new Error(`Invalid agent response: ${checked.error}`);
      return checked.value;
    } catch (error) {
      if (timedOut) throw new Error('The agent backend took too long to respond.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
}
