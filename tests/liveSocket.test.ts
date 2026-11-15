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
import type { LiveAction } from '../src/live/protocol';
import { validateAssessmentPlan } from '../src/vision/assessmentPlan';
import { validatePresentationPlan } from '../src/shared/presentation';
import { syntheticPracticeAttempt } from './fixtures/practiceAttempt';

test('live provider tool travels through the real planner validator and requires app acknowledgment', async t => {
  const sequence = createWallAngelReference(wallAngelDefaults, 'live-wire');
  let receive!: (message: ProviderMessage) => void;
  let plans = 0;
  const responses: { functionResponses: { willContinue?: boolean; response: { ok?: boolean; status?: string } }[] }[] = [];
  const media: unknown[] = [];
  const context: { turns?: { parts?: { text?: string }[] }[]; turnComplete?: boolean }[] = [];
  const options = { ...anatomyAgentCapabilities, apiKey: 'mock-openai', geminiApiKey: 'mock-gemini', model: 'mock-planner', conversationModel: 'mock-live',
    reasoningEffort: 'low' as const,
    fetch: async (_url: unknown, init?: RequestInit) => { plans++;
      const request = JSON.parse(init!.body as string);
      assert.equal(request.reasoning.effort, 'low');
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [
      { type: 'output_text', text: JSON.stringify({ steps: sequence.steps.map(step => {
        assert.ok('parallel' in step);
        return { targets: step.parallel.map(command => ({ componentId: command.componentId, toDeg: command.parameters.toDeg })),
          durationSeconds: step.durationSeconds, holdSeconds: step.holdSeconds, view: 'back' };
      }), assessment: [{ stepIndex: 1, side: 'left', metric: 'forearm_direction', toleranceDeg: 20 }], message: '' }) },
    ] }] }); },
    connectConversation: async (callbacks: { message(message: ProviderMessage): void }) => {
      receive = callbacks.message;
      return { close() {}, sendRealtimeInput(value: unknown) { media.push(value); }, sendClientContent(value: typeof context[number]) {
        context.push(value); for (const wake of waiting.splice(0)) wake();
      },
        sendToolResponse(value: typeof responses[number]) { responses.push(value); } };
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
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'clock', clientSentAt: 123 }));
  await until(() => messages.some(message => message.type === 'clock'));
  const clock = messages.find(message => message.type === 'clock')!;
  assert.equal(clock.clientSentAt, 123); assert.ok(Math.abs(Date.now() - (clock.serverNow as number)) < 1000);
  socket.send(JSON.stringify({ type: 'context', sequence: null, playback: null }));
  await until(() => messages.some(message => message.type === 'ready'));
  socket.send(JSON.stringify({ type: 'text', text: 'Show a wall angel.' }));
  socket.send(JSON.stringify({ type: 'audio', data: Buffer.alloc(3200).toString('base64') }));
  await until(() => media.length > 0);
  receive(Object.assign(new ProviderMessage(), { serverContent: { turnComplete: true, outputTranscription: { text: 'Speculative refusal' }, modelTurn: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/pcm;rate=24000' } }] } }, toolCall: { functionCalls: [{ id: 'call-1', name: 'request_movement', args: { request: 'Wall angel' } }] } }));
  await until(() => messages.some(message => message.type === 'action'));
  assert.equal(messages.some(message => message.type === 'turn_complete'), false, 'A provider completion bundled with a tool call cannot end the request early.');
  assert.equal(responses.length, 0, 'No spoken progress response is requested before app acceptance.');
  assert.equal(messages.some(message => message.type === 'audio' || message.type === 'transcript'), false);
  receive(Object.assign(new ProviderMessage(), { serverContent: { outputTranscription: { text: 'Still speculative' }, modelTurn: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/pcm;rate=24000' } }] } } }));
  const action = messages.find(message => message.type === 'action')!;
  assert.ok(compileUpperBodySequence((action.action as { sequence: unknown }).sequence));
  const movement = action.action as Extract<LiveAction, { type: 'play_sequence' }>;
  assert.equal(validateAssessmentPlan(movement.assessmentPlan, movement.sequence)?.checks.length, 1);
  assert.equal(validatePresentationPlan(movement.presentationPlan, movement.sequence)?.steps[0].view, 'back');
  socket.send(JSON.stringify({ type: 'applied', commandId: action.commandId, ok: true }));
  await until(() => responses.length === 1);
  receive(Object.assign(new ProviderMessage(), { serverContent: { turnComplete: true, outputTranscription: { text: 'Watch the movement on screen.' }, modelTurn: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/pcm;rate=24000' } }] } } }));
  await until(() => messages.some(message => message.type === 'turn_complete'));
  assert.equal(messages.filter(message => message.type === 'audio').length, 1);
  assert.equal(messages.filter(message => message.type === 'transcript').length, 1);
  assert.equal(responses[0].functionResponses[0].willContinue, false);
  assert.equal(responses[0].functionResponses[0].response.ok, true);
  const completedBeforeDuplicate = messages.filter(message => message.type === 'turn_complete').length;
  receive(Object.assign(new ProviderMessage(), { serverContent: { turnComplete: true },
    toolCall: { functionCalls: [{ id: 'call-1', name: 'request_movement', args: { request: 'Wall angel' } }] } }));
  await until(() => responses.length === 2);
  assert.equal(plans, 1); assert.equal(messages.filter(message => message.type === 'action').length, 1);
  assert.equal(messages.filter(message => message.type === 'turn_complete').length, completedBeforeDuplicate,
    'Cached tool responses still require a later provider output completion, not a synthetic finally event.');
  receive(Object.assign(new ProviderMessage(), { serverContent: { turnComplete: true } }));
  await until(() => messages.filter(message => message.type === 'turn_complete').length === completedBeforeDuplicate + 1);
  // The observed native-audio endpoint uses `type`; SDK 3.3 declares
  // `voiceActivityType`. Neither path requires optional transcription.finished.
  for (const field of ['type', 'voiceActivityType']) {
    const beforeActions = messages.filter(message => message.type === 'action').length;
    const beforeResponses = responses.length;
    receive(Object.assign(new ProviderMessage(), { voiceActivity: { [field]: 'ACTIVITY_START' } }));
    receive(Object.assign(new ProviderMessage(), { serverContent: { inputTranscription: { text: 'Show one small wall angel.' } } }));
    receive(Object.assign(new ProviderMessage(), { voiceActivity: { [field]: 'ACTIVITY_END' },
      toolCall: { functionCalls: [{ id: `spoken-${field}`, name: 'request_movement', args: { request: 'Small wall angel' } }] } }));
    await until(() => messages.filter(message => message.type === 'action').length === beforeActions + 1);
    socket.send(JSON.stringify({ type: 'applied', commandId: messages.filter(message => message.type === 'action').at(-1)!.commandId, ok: true }));
    await until(() => responses.length === beforeResponses + 1);
    assert.equal(responses.at(-1)!.functionResponses[0].response.ok, true);
  }
  assert.equal(plans, 3);
  const latest = messages.filter(message => message.type === 'action').at(-1)!.action as typeof movement;
  const now = Date.now();
  const completionContext = { type: 'context', sequence: latest.sequence, playback: {
    sequenceId: latest.sequence.id, stepIndex: 1, phase: 'completed', status: 'completed', updatedAt: now,
  }, practiceStartedAt: null };
  socket.send(JSON.stringify(completionContext));
  socket.send(JSON.stringify({ type: 'clock', clientSentAt: 999 }));
  await until(() => messages.some(message => message.type === 'clock' && message.clientSentAt === 999));
  const invitations = () => context.filter(value => value.turns?.[0]?.parts?.[0]?.text?.startsWith('DEMONSTRATION_FINISHED'));
  assert.equal(invitations().length, 0, 'Do not interrupt an outstanding conversation turn.');
  receive(Object.assign(new ProviderMessage(), { serverContent: { turnComplete: true } }));
  assert.equal(invitations().length, 1);
  assert.equal(invitations()[0].turnComplete, true);
  assert.match(invitations()[0].turns![0].parts![0].text!, /Now try the movement yourself/);
  socket.send(JSON.stringify(completionContext));
  socket.send(JSON.stringify({ type: 'clock', clientSentAt: 1000 }));
  await until(() => messages.some(message => message.type === 'clock' && message.clientSentAt === 1000));
  assert.equal(invitations().length, 1, 'Repeated completion context cannot repeat the invitation.');
  receive(Object.assign(new ProviderMessage(), { serverContent: { turnComplete: true } }));
  socket.send(JSON.stringify({ type: 'context', sequence: latest.sequence, playback: {
    sequenceId: latest.sequence.id, stepIndex: 1, phase: 'completed', status: 'completed', updatedAt: now,
  }, practiceStartedAt: now - 3500, practiceStage: 'performing' }));
  const contextsBefore = context.length;
  socket.send(JSON.stringify({ type: 'form', report: { sequenceId: latest.sequence.id, stepIndex: 1,
    checkId: 'invented', observedAt: now, status: 'aligned', message: 'Invented perfect form', measurements: { left_forearm_direction: 180 } } }));
  socket.send(JSON.stringify({ type: 'clock', clientSentAt: 1001 }));
  await until(() => messages.some(message => message.type === 'clock' && message.clientSentAt === 1001));
  assert.equal(context.length, contextsBefore, 'Per-frame form reports cannot prompt ongoing correction speech.');
  const audioBefore = messages.filter(message => message.type === 'audio').length;
  receive(Object.assign(new ProviderMessage(), { serverContent: { outputTranscription: { text: 'Bend your left elbow more.' },
    modelTurn: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/pcm;rate=24000' } }] }, turnComplete: true } }));
  assert.equal(messages.filter(message => message.type === 'audio').length, audioBefore, 'The performing stage suppresses unsolicited corrective output.');
  socket.send(JSON.stringify({ type: 'form', report: { sequenceId: latest.sequence.id, stepIndex: 1,
    observedAt: now + 1, status: 'aligned', measurements: {} } }));
  socket.send(JSON.stringify({ ...completionContext, practiceStartedAt: now - 3500, practiceStage: 'review' }));
  const attempt = syntheticPracticeAttempt(latest.sequence, now - 3500);
  socket.send(JSON.stringify({ type: 'practice_attempt', attempt }));
  await until(() => messages.some(message => message.type === 'practice_review'));
  const review = messages.find(message => message.type === 'practice_review')!.review as { status: string; message: string };
  assert.equal(review.status, 'aligned'); assert.match(review.message, /looked good/);
  assert.match(context.at(-1)!.turns?.[0]?.parts?.[0]?.text ?? '', /PRACTICE_REVIEW/);
  const afterReview = context.length;
  socket.send(JSON.stringify({ type: 'practice_attempt', attempt }));
  socket.send(JSON.stringify({ type: 'clock', clientSentAt: 1002 }));
  await until(() => messages.some(message => message.type === 'clock' && message.clientSentAt === 1002));
  assert.equal(context.length, afterReview, 'One completed attempt produces only one spoken review.');
  assert.equal(JSON.stringify(messages).includes('mock-openai'), false); assert.equal(JSON.stringify(messages).includes('mock-gemini'), false);
  const altered = structuredClone(latest.sequence);
  const step = altered.steps[0]; assert.ok('parallel' in step);
  step.holdSeconds = step.holdSeconds === 0 ? 0.1 : 0;
  socket.send(JSON.stringify({ type: 'context', sequence: altered, playback: null }));
  await until(() => messages.some(message => message.type === 'error'));
  assert.match(String(messages.at(-1)!.message), /Invalid live-session message/);
});
