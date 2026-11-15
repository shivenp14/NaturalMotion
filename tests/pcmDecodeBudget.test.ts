import assert from 'node:assert/strict';
import test from 'node:test';
import { PcmDecodeBudget } from '../src/voice/pcmDecodeBudget';
const pcm = (seconds: number) => Buffer.alloc(seconds * 48000).toString('base64');

test('pending decode reservations share the fifteen-second limit with queued audio', () => {
  const budget = new PcmDecodeBudget();
  const release = budget.reserve(pcm(10), 0);
  budget.reserve(pcm(3), 2);
  assert.equal(budget.seconds, 13);
  assert.throws(() => budget.reserve(pcm(1), 2));
  release!(); release!(); assert.equal(budget.seconds, 3);
  assert.doesNotThrow(() => budget.reserve(pcm(10), 2));
});

test('interrupted decode completions cannot subtract a newer generation reservation', () => {
  const budget = new PcmDecodeBudget();
  const old = budget.reserve(pcm(10), 0);
  budget.reset(); const next = budget.reserve(pcm(2), 0);
  old!(); assert.equal(budget.seconds, 2);
  next!(); assert.equal(budget.seconds, 0);
  assert.throws(() => budget.reserve('AAAA', 0), /Invalid PCM/);
});


test('overloaded reply is discarded until completion and old decodes cannot consume the next budget', () => {
  const budget = new PcmDecodeBudget();
  const old = budget.reserve(pcm(14), 0)!;
  assert.throws(() => budget.reserve(pcm(2), 0), /fell behind/);
  budget.discardReply();
  assert.equal(budget.seconds, 0); assert.equal(budget.reserve(pcm(10), 0), null);
  budget.finishReply(); const next = budget.reserve(pcm(2), 0)!;
  old(); assert.equal(budget.seconds, 2); next(); assert.equal(budget.seconds, 0);
  budget.discardReply(); budget.reset();
  assert.ok(budget.reserve(pcm(1), 0), 'An interruption can begin a fresh reply.');
});
