import type { AgentAdapter, AgentRequest } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Mobile-side agent transport. The server keeps provider API keys and uses
 * its own copy of the executable movement catalog. Never ship a model key
 * through EXPO_PUBLIC_* configuration.
 */
export class HttpAgentAdapter implements AgentAdapter {
  constructor(private readonly baseUrl: string = process.env.EXPO_PUBLIC_API_BASE_URL ?? '') {}

  async respond(request: AgentRequest, signal?: AbortSignal) {
    if (!this.baseUrl.trim()) {
      throw new Error('Set EXPO_PUBLIC_API_BASE_URL to a reachable agent server.');
    }
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/agent/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        utterance: request.utterance,
        currentSequence: request.currentSequence,
      }),
      signal,
    });
    const raw: unknown = await response.json();
    if (!response.ok) {
      const message = isRecord(raw) && typeof raw.error === 'string' ? raw.error : 'Agent service unavailable.';
      throw new Error(message);
    }
    if (!isRecord(raw) || typeof raw.speech !== 'string' || !raw.speech.trim() ||
        raw.speech.length > 600) {
      throw new Error('Agent service returned an invalid response.');
    }
    // The caller still runs validateSequence before accepting this untrusted data.
    return {
      speech: raw.speech,
      ...(Object.prototype.hasOwnProperty.call(raw, 'sequence') ? { sequence: raw.sequence } : {}),
    };
  }
}
