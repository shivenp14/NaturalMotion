import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { WebSocket } from 'ws';
import { LiveServerMessage as ProviderMessage } from '@google/genai';
import { attachLiveServer } from '../server/live/socket';
import { createAgentServer } from '../server/http';
import { anatomyAgentCapabilities } from '../src/anatomy/agentCapabilities';
import { createWallAngelReference, compileUpperBodySequence } from '../src/anatomy/upperBodySequence';
import { wallAngelDefaults } from '../src/anatomy/wallAngel';
import { GOALPOST_ARMS_CHECK_ID } from '../src/vision/checks/goalpostArms';

test('live provider tool travels through the real planner validator and requires app acknowledgment', async t => {
  const sequence = createWallAngelReference(wallAngelDefaults, 'live-wire');
  let receive!: (message: ProviderMessage) => void;
  let plans = 0;
  const responses: unknown[] = [];
  const media: unknown[] = [];
  const context: { turns?: { parts?: { text?: string }[] }[]; turnComplete?: boolean }[] = [];
  const options = { ...anatomyAgentCapabilities, apiKey: 'mock-openai', geminiApiKey: 'mock-gemini', model: 'mock-planner', conversationModel: 'mock-live',
    fetch: async () => { plans++; return Response.json({ status: 'completed', output: [{ type: 'message', content: [
      { type: 'output_text', text: JSON.stringify({ actions: [{ type: 'play_sequence', sequence }] }) },
    ] }] }); },
    connectConversation: async (callbacks: { message(message: ProviderMessage): void }) => {
      receive = callbacks.message;
      return { close() {}, sendRealtimeInput(value: unknown) { media.push(value); }, sendClientContent(value: typeof context[number]) { context.push(value); },
        sendToolResponse(value: unknown) { responses.push(value); } };
    },
  };
  const server = createAgentServer(options);
  attachLiveServer(server, options); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const socket = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/live`);
  t.after(() => { socket.terminate(); server.close(); });
  const messages: Record<string, unknown>[] = [];
  const waiting: (() => void)[] = [];
  socket.on('message', data => { messages.push(JSON.parse(data.toString())); for (const wake of waiting.splice(0)) wake(); });
  const until = async (predicate: () => boolean) => {
    const timeout = setTimeout(() => { for (const wake of waiting.splice(0)) wake(); }, 2000);
    const deadline = Date.now() + 2000;
    while (!predicate() && Date.now() < deadline) await new Promise<void>(resolve => waiting.push(resolve));
    clearTimeout(timeout); assert.ok(predicate(), 'Expected live protocol event.');
  };
  await once(socket, 'open'); socket.send(JSON.stringify({ type: 'context', sequence: null, playback: null }));
  await until(() => messages.some(message => message.type === 'ready'));
  socket.send(JSON.stringify({ type: 'text', text: 'Show a wall angel.' }));
  socket.send(JSON.stringify({ type: 'audio', data: Buffer.alloc(3200).toString('base64') }));
  await until(() => media.length > 0);
  receive(Object.assign(new ProviderMessage(), { serverContent: { turnComplete: true }, toolCall: { functionCalls: [{ id: 'call-1', name: 'request_movement', args: { request: 'Wall angel' } }] } }));
  await until(() => messages.some(message => message.type === 'action'));
  assert.equal(responses.length, 0, 'No success may reach the model before client acceptance.');
  const action = messages.find(message => message.type === 'action')!;
  assert.ok(compileUpperBodySequence((action.action as { sequence: unknown }).sequence));
  socket.send(JSON.stringify({ type: 'applied', commandId: action.commandId, ok: true }));
  await until(() => responses.length === 1);
  receive(Object.assign(new ProviderMessage(), { toolCall: { functionCalls: [{ id: 'call-1', name: 'request_movement', args: { request: 'Wall angel' } }] } }));
  await until(() => responses.length === 2);
  assert.equal(plans, 1); assert.equal(messages.filter(message => message.type === 'action').length, 1);
  const now = Date.now();
  socket.send(JSON.stringify({ type: 'context', sequence, playback: {
    sequenceId: sequence.id, stepIndex: 1, phase: 'completed', status: 'completed', updatedAt: now,
  }, practiceStartedAt: now }));
  socket.send(JSON.stringify({ type: 'form', report: { sequenceId: sequence.id, stepIndex: 1,
    checkId: GOALPOST_ARMS_CHECK_ID, observedAt: now, status: 'not_observable', message: 'Invented perfect form' } }));
  // The check identifier comes from the renderer-owned profile, not client wording.
  await until(() => context.length > 1);
  const feedback = context.at(-1)!;
  assert.equal(feedback.turnComplete, true);
  const text = feedback.turns?.[0]?.parts?.[0]?.text ?? '';
  assert.match(text, /not_observable/); assert.match(text, /practice/);
  assert.doesNotMatch(text, /Invented perfect form/);
  assert.equal(JSON.stringify(messages).includes('mock-openai'), false); assert.equal(JSON.stringify(messages).includes('mock-gemini'), false);
});
