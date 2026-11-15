import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { generateAgentReturn, parseAgentRequest } from '../server/agent';
import { createAgentServer } from '../server/http';

const input = { utterance: 'Hello', catalog: [], currentSequence: null };
const validOutput = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text',
  text: JSON.stringify({ actions: [{ type: 'speak_text', text: 'Hello. What would you like to know?' }] }) }] }] };

test('backend ignores app-claimed capabilities and rejects invalid session context', () => {
  assert.deepEqual(parseAgentRequest({ ...input, catalog: [{ id: 'invented' }], cues: { bad: 'fake' } }), input);
  for (const value of [null, { ...input, utterance: '' }, { ...input, currentSequence: {} }, { ...input, observation: {} }]) {
    assert.throws(() => parseAgentRequest(value));
  }
});

test('provider request keeps credentials server-side and validates structured output', async () => {
  const result = await generateAgentReturn(input, { apiKey: 'test-key', model: 'test-model', fetch: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init!.body as string);
    assert.equal(body.store, false);
    assert.equal(body.model, 'test-model');
    assert.equal(body.text.format.strict, true);
    assert.equal(body.input.includes('test-key'), false);
    return Response.json(validOutput);
  } });
  assert.deepEqual(result.actions, [{ type: 'speak_text', text: 'Hello. What would you like to know?' }]);
  assert.ok(result.decisionId);
});

test('rejects invented movement, refusals, incomplete and malformed provider output', async () => {
  for (const output of [{ status: 'incomplete', output: [] },
    { ...validOutput, output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] },
    { ...validOutput, output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] },
    { ...validOutput, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ actions: [
      { type: 'play_sequence', sequence: { id: 'x', steps: [{ componentId: 'fake', parameters: {} }] } },
    ] }) }] }] }]) {
    await assert.rejects(generateAgentReturn(input, { apiKey: 'key', model: 'test', fetch: async () => Response.json(output) }));
  }
});

test('HTTP service handles real requests without leaking provider errors or secrets', async t => {
  const server = createAgentServer({ apiKey: 'test-secret', model: 'test', fetch: async () => Response.json(validOutput) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  assert.deepEqual(await (await fetch(`${url}/health`)).json(), { ready: true, provider: 'openai' });
  const result = await fetch(`${url}/agent/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(result.status, 200);
  assert.ok((await result.json()).decisionId);
  const bad = await fetch(`${url}/agent/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(bad.status, 400);
  const noKey = createAgentServer({ apiKey: '', model: 'test' });
  noKey.listen(0, '127.0.0.1');
  await once(noKey, 'listening');
  t.after(() => noKey.close());
  const unavailable = await fetch(`http://127.0.0.1:${(noKey.address() as AddressInfo).port}/agent/respond`, { method: 'POST' });
  assert.equal(unavailable.status, 503);
});

test('canonical simultaneous sequences cross HTTP unchanged and require policy at both boundaries', async t => {
  const { HttpAgentAdapter } = await import('../src/agent/HttpAgentAdapter');
  const catalog = [{ id: 'joint-fixture', label: 'Synthetic channel',
    parameters: { fromDeg: { minimum: 0, maximum: 100 }, toDeg: { minimum: 0, maximum: 100 } },
    controlledChannels: ['joint-fixture'], muscleRegionIds: [], cameraView: 'test', requiredLandmarks: [], supportedCheckIds: [] }];
  const sequence = { id: 'composed', steps: [{ parallel: [{ componentId: 'joint-fixture',
    parameters: { fromDeg: 0, toDeg: 80 } }], durationSeconds: 3, holdSeconds: 1 }] };
  // Unconditional allow is a synthetic protocol fixture, never production configuration.
  const compositionPolicy = () => null;
  const output = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text',
    text: JSON.stringify({ actions: [{ type: 'play_sequence', sequence }] }) }] }] };
  const server = createAgentServer({ apiKey: 'fixture', model: 'test', catalog, compositionPolicy,
    fetch: async () => Response.json(output) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const adapter = new HttpAgentAdapter({ baseUrl, compositionPolicy });
  const reply = await adapter.respond({ ...input, catalog });
  assert.deepEqual((reply as { actions: unknown[] }).actions, [{ type: 'play_sequence', sequence }]);
  const unconfiguredClient = new HttpAgentAdapter({ baseUrl });
  await assert.rejects(unconfiguredClient.respond({ ...input, catalog }), /execution is not configured/);
  await assert.rejects(generateAgentReturn({ ...input, catalog }, { apiKey: 'fixture', model: 'test', catalog,
    fetch: async () => Response.json(output) }), /execution is not configured/);
  assert.throws(() => parseAgentRequest({ ...input, catalog, currentSequence: sequence }, catalog));
  assert.deepEqual(parseAgentRequest({ ...input, catalog, currentSequence: sequence }, catalog, compositionPolicy).currentSequence, sequence);
});
