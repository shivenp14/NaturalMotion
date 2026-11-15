import assert from 'node:assert/strict';
import test from 'node:test';
import { appendCleanup } from '../src/session/cleanup';

test('a repeated stop cannot let a new session pass unfinished native shutdown', async () => {
  let release!: () => void; let started = false;
  const native = new Promise<void>(resolve => { release = resolve; });
  const first = appendCleanup(Promise.resolve(), () => native);
  const second = appendCleanup(first);
  assert.equal(second, first);
  const nextStart = second.then(() => { started = true; });
  await Promise.resolve(); assert.equal(started, false);
  release(); await nextStart; assert.equal(started, true);
});

test('successive resources release in order even when earlier cleanup fails', async () => {
  const events: string[] = [];
  const first = appendCleanup(Promise.resolve(), async () => { events.push('first'); throw new Error('Already closed.'); });
  await appendCleanup(first, async () => { events.push('second'); });
  assert.deepEqual(events, ['first', 'second']);
});
