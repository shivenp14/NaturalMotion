import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveClient } from '../src/live/LiveClient';
import type { LiveServerMessage } from '../src/live/protocol';

class FakeSocket {
  readyState: 0 | 1 | 2 | 3 = 1;
  bufferedAmount = 0;
  onopen: WebSocket['onopen'] = null;
  onclose: WebSocket['onclose'] = null;
  onerror: WebSocket['onerror'] = null;
  onmessage: WebSocket['onmessage'] = null;
  messages: Record<string, unknown>[] = [];
  send(data: string) { this.messages.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  open(serverOffset = 0) {
    this.onopen?.call(this as unknown as WebSocket, new Event('open'));
    const sent = this.messages.at(-1)!;
    this.receive({ type: 'clock', clientSentAt: sent.clientSentAt as number, serverNow: (sent.clientSentAt as number) + serverOffset });
  }
  receive(message: LiveServerMessage) {
    this.onmessage?.call(this as unknown as WebSocket, { data: JSON.stringify(message) } as MessageEvent);
  }
}

test('client acknowledges each action once and rejects cancelled or expired actions', async () => {
  const socket = new FakeSocket(); let applied = 0;
  const client = new LiveClient({ baseUrl: 'http://localhost:3001', socketFactory: () => socket,
    context: { type: 'context', sequence: null, playback: null }, apply: () => { applied++; },
    onMessage: () => {}, onClose: () => {} });
  const starting = client.start(); socket.open();
  socket.receive({ type: 'ready', conversationModel: 'fixture', plannerModel: 'fixture' }); await starting;
  const action = { type: 'action', commandId: 'a', action: { type: 'pause_movement' }, expiresAt: Date.now() + 5000 } as const;
  socket.receive(action); socket.receive(action);
  assert.equal(applied, 1);
  socket.receive({ type: 'cancel', commandId: 'b' }); socket.receive({ ...action, commandId: 'b' });
  socket.receive({ ...action, commandId: 'c', expiresAt: Date.now() - 1 });
  assert.equal(applied, 1);
  assert.deepEqual(socket.messages.slice(-2).map(message => message.ok), [false, false]);
  client.stop(); socket.receive({ ...action, commandId: 'late' }); assert.equal(applied, 1);
});

test('client stops instead of buffering unlimited microphone audio on a slow connection', async () => {
  const socket = new FakeSocket(); let reason = '';
  const client = new LiveClient({ baseUrl: 'http://localhost:3001', socketFactory: () => socket,
    context: { type: 'context', sequence: null, playback: null }, apply: () => {},
    onMessage: () => {}, onClose: message => { reason = message; } });
  const starting = client.start(); socket.open();
  socket.receive({ type: 'ready', conversationModel: 'fixture', plannerModel: 'fixture' }); await starting;
  socket.bufferedAmount = 256001; client.send({ type: 'audio', data: 'AAAA' });
  assert.equal(socket.readyState, 3); assert.match(reason, /Network/);
});

test('client flushes only the newest playback context after provider initialization', async () => {
  const socket = new FakeSocket();
  const client = new LiveClient({ baseUrl: 'http://localhost:3001', socketFactory: () => socket,
    now: () => 1000, context: { type: 'context', sequence: null, playback: null }, apply: () => {}, onMessage: () => {}, onClose: () => {} });
  const starting = client.start(); socket.open();
  client.send({ type: 'context', sequence: null, playback: null, practiceStartedAt: 1 });
  client.send({ type: 'context', sequence: null, playback: null, practiceStartedAt: 2 });
  assert.equal(socket.messages.length, 2);
  socket.receive({ type: 'ready', conversationModel: 'fixture', plannerModel: 'fixture' }); await starting;
  assert.equal(socket.messages.length, 3); assert.equal(socket.messages[2].practiceStartedAt, 2); client.stop();
});

test('clock calibration handles phones ahead or behind without extending stale action expiry', async () => {
  for (const skew of [-120000, 120000]) {
    const socket = new FakeSocket(); let applied = 0;
    const serverNow = 1000000, phoneNow = serverNow + skew;
    const client = new LiveClient({ baseUrl: 'http://localhost:3001', socketFactory: () => socket, now: () => phoneNow,
      context: { type: 'context', sequence: null, playback: null, practiceStartedAt: phoneNow - 500 },
      apply: () => { applied++; }, onMessage: () => {}, onClose: () => {} });
    const starting = client.start(); socket.open(-skew);
    socket.receive({ type: 'ready', conversationModel: 'fixture', plannerModel: 'fixture' }); await starting;
    client.send({ type: 'image', data: 'AAAA', observedAt: phoneNow - 100 });
    client.send({ type: 'form', report: { sequenceId: 's', stepIndex: 0, observedAt: phoneNow - 200,
      status: 'not_observable', checkId: null, message: '', mode: 'practice' } });
    assert.equal(socket.messages[1].practiceStartedAt, serverNow - 500);
    assert.equal(socket.messages[2].observedAt, serverNow - 100);
    assert.equal((socket.messages[3].report as { observedAt: number }).observedAt, serverNow - 200);
    socket.receive({ type: 'action', commandId: 'fresh', action: { type: 'pause_movement' }, expiresAt: serverNow + 1000 });
    socket.receive({ type: 'action', commandId: 'delayed', action: { type: 'pause_movement' }, expiresAt: serverNow - 1000 });
    assert.equal(applied, 1); assert.equal(socket.messages.at(-1)!.ok, false); client.stop();
  }
});

test('uncertain clock synchronization fails closed before provider initialization', async () => {
  const socket = new FakeSocket(); let now = 1000;
  const client = new LiveClient({ baseUrl: 'http://localhost:3001', socketFactory: () => socket, now: () => now,
    context: { type: 'context', sequence: null, playback: null }, apply: () => {}, onMessage: () => {}, onClose: () => {} });
  const starting = client.start();
  socket.onopen?.call(socket as unknown as WebSocket, new Event('open')); now += 2001;
  socket.receive({ type: 'clock', clientSentAt: 1000, serverNow: 2000 });
  await assert.rejects(starting); assert.equal(socket.readyState, 3);
  assert.equal(socket.messages.some(message => message.type === 'context'), false);
});

test('asymmetric synchronization delays cannot let an expired action run before its cancellation arrives', async () => {
  for (const skew of [-120000, 120000]) for (const outbound of [0, 1800]) {
    const socket = new FakeSocket(); let applied = 0; let serverNow = 1000;
    const client = new LiveClient({ baseUrl: 'http://localhost:3001', socketFactory: () => socket,
      now: () => serverNow + skew, context: { type: 'context', sequence: null, playback: null },
      apply: () => { applied++; }, onMessage: () => {}, onClose: () => {} });
    const starting = client.start();
    socket.onopen?.call(socket as unknown as WebSocket, new Event('open'));
    serverNow += 1800; // Round trip with either all outbound or all return delay.
    socket.receive({ type: 'clock', clientSentAt: 1000 + skew, serverNow: 1000 + outbound });
    socket.receive({ type: 'ready', conversationModel: 'fixture', plannerModel: 'fixture' }); await starting;
    serverNow = 3000;
    socket.receive({ type: 'action', commandId: 'fresh', action: { type: 'pause_movement' }, expiresAt: 7000 });
    assert.equal(applied, 1, 'Ordinary unexpired actions still apply.');
    serverNow = 7400;
    // In the return-delay case the midpoint says 6500, although the server's
    // deadline has passed. Deliver the stale action before its cancellation.
    socket.receive({ type: 'action', commandId: 'delayed', action: { type: 'pause_movement' }, expiresAt: 7000 });
    assert.equal(applied, 1); assert.equal(socket.messages.at(-1)!.ok, false);
    socket.receive({ type: 'cancel', commandId: 'delayed' }); client.stop();
  }
});
