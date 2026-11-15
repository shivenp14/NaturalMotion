import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpAgentAdapter } from '../src/agent/HttpAgentAdapter';
import type { AgentRequest } from '../src/agent/types';

const request: AgentRequest = { utterance: 'Hello', catalog: [], currentSequence: null };
const reply = { decisionId: 'd', trigger: { type: 'user_utterance', id: 'u' },
  actions: [{ type: 'speak_text', text: 'Hello. No movements are available yet.' }] };

test('posts transcript and context, returning only a validated action batch', async () => {
  const adapter = new HttpAgentAdapter({ baseUrl: 'http://localhost:3001/', fetch: async (url, init) => {
    assert.equal(url, 'http://localhost:3001/agent/respond');
    assert.deepEqual(JSON.parse(init!.body as string), request);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
    return Response.json(reply);
  } });
  assert.deepEqual(await adapter.respond(request), reply);
});

test('rejects backend failures and unregistered movements', async () => {
  const failed = new HttpAgentAdapter({ baseUrl: 'http://localhost:3001', fetch: async () => new Response('', { status: 503 }) });
  await assert.rejects(failed.respond(request), /HTTP 503/);
  const invalid = new HttpAgentAdapter({ baseUrl: 'http://localhost:3001', fetch: async () => Response.json({ ...reply,
    actions: [{ type: 'play_sequence', sequence: { id: 'x', steps: [{ componentId: 'invented', parameters: {} }] } }] }) });
  await assert.rejects(invalid.respond(request), /Invalid agent response/);
});

test('HTTP diagnostics omit camera observations from the supported transcript wire format', async () => {
  const adapter = new HttpAgentAdapter({ baseUrl: 'http://localhost:3001', fetch: async (_url, init) => {
    assert.deepEqual(JSON.parse(init!.body as string), request); return Response.json(reply);
  } });
  await adapter.respond({ ...request, observation: { sequenceId: 'fixture', stepIndex: 0,
    checkId: 'fixture', observedAt: 1, status: 'aligned', measurements: {} } });
});

test('propagates cancellation and times out stalled requests', async () => {
  const stalled: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    if (init?.signal?.aborted) reject(new Error('aborted'));
    else init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const adapter = new HttpAgentAdapter({ baseUrl: 'http://localhost:3001', fetch: stalled, timeoutMs: 10 });
  await assert.rejects(adapter.respond(request), /too long/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(adapter.respond(request, controller.signal), /aborted/);
});
