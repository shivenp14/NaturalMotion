import assert from 'node:assert/strict';
import test from 'node:test';
import { encodePcm16 } from '../src/voice/pcm';

test('mobile PCM encoder emits clipped signed little-endian samples and valid base64 padding', () => {
  const decoded = Buffer.from(encodePcm16(new Float32Array([-2, -1, 0, 1, 2, NaN])), 'base64');
  assert.deepEqual(Array.from({ length: 6 }, (_, index) => decoded.readInt16LE(index * 2)), [-32768, -32768, 0, 32767, 32767, 0]);
  for (const length of [1, 2, 3, 1600]) assert.equal(Buffer.from(encodePcm16(new Float32Array(length)), 'base64').length, length * 2);
});
