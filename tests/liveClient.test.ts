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
  open() { this.onopen?.call(this as unknown as WebSocket, new Event('open')); }
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
