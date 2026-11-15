import assert from 'node:assert/strict';
import test from 'node:test';
import { MicrophoneSilenceGate } from '../src/voice/microphoneGate';

const chunk = (data: string, peak = 0, durationMs = 100) => ({ data, peak, durationMs });

test('long initial near-silence sends no continuous audio and preserves the latest 300ms', () => {
  const gate = new MicrophoneSilenceGate();
  for (let index = 0; index < 10000; index++) {
    assert.deepEqual(gate.push(chunk(`quiet-${index}`, 0.0001)), { audio: [], audioStreamEnd: false });
  }
  assert.deepEqual(gate.push(chunk('speech', 0.03)), {
    audio: ['quiet-9997', 'quiet-9998', 'quiet-9999', 'speech'], audioStreamEnd: false,
  });
});

test('quiet speech crosses the conservative threshold without onset delay', () => {
  const gate = new MicrophoneSilenceGate();
  gate.push(chunk('quiet-onset', 0.0002));
  assert.deepEqual(gate.push(chunk('quiet-word', 0.0006)), {
    audio: ['quiet-onset', 'quiet-word'], audioStreamEnd: false,
  });
  assert.deepEqual(gate.push(chunk('at-threshold', 0.0005)), { audio: ['at-threshold'], audioStreamEnd: false });
});

test('hangover preserves phrase pauses and ends a quiet stream exactly once', () => {
  const gate = new MicrophoneSilenceGate();
  gate.push(chunk('first', 0.1));
  for (let index = 0; index < 8; index++) {
    assert.deepEqual(gate.push(chunk(`pause-${index}`)), { audio: [`pause-${index}`], audioStreamEnd: false });
  }
  assert.equal(gate.push(chunk('continuation', 0.01)).audioStreamEnd, false);
  for (let index = 0; index < 8; index++) assert.equal(gate.push(chunk(`tail-${index}`)).audioStreamEnd, false);
  assert.deepEqual(gate.push(chunk('last-tail')), { audio: ['last-tail'], audioStreamEnd: true });
  for (let index = 0; index < 1000; index++) {
    assert.deepEqual(gate.push(chunk(`idle-${index}`)), { audio: [], audioStreamEnd: false });
  }
  assert.deepEqual(gate.push(chunk('next-turn', 0.1)), {
    audio: ['idle-997', 'idle-998', 'idle-999', 'next-turn'], audioStreamEnd: false,
  });
});

test('pre-roll uses captured durations, retaining a full window of variable size chunks', () => {
  const gate = new MicrophoneSilenceGate();
  for (const data of ['a', 'b', 'c', 'd']) gate.push(chunk(data, 0, 80));
  gate.push(chunk('e', 0, 80));
  assert.deepEqual(gate.push(chunk('speech', 0.01, 80)).audio, ['b', 'c', 'd', 'e', 'speech']);
});

test('hangover is driven by captured samples rather than number of callbacks', () => {
  const gate = new MicrophoneSilenceGate();
  gate.push(chunk('speech', 0.01));
  for (let index = 0; index < 17; index++) assert.equal(gate.push(chunk('quiet', 0, 50)).audioStreamEnd, false);
  assert.equal(gate.push(chunk('quiet', 0, 50)).audioStreamEnd, true);
});

test('reset drops old-session pre-roll and pending end state', () => {
  const gate = new MicrophoneSilenceGate();
  gate.push(chunk('old-preroll')); gate.reset();
  assert.deepEqual(gate.push(chunk('speech', 0.02)).audio, ['speech']);
  gate.push(chunk('old-tail', 0, 800)); gate.reset();
  assert.deepEqual(gate.push(chunk('new-quiet')), { audio: [], audioStreamEnd: false });
  assert.deepEqual(gate.push(chunk('new-speech', 0.02)).audio, ['new-quiet', 'new-speech']);
});

test('invalid sample metadata is explicit rather than silently suppressing possible speech', () => {
  const gate = new MicrophoneSilenceGate();
  for (const invalid of [chunk('audio', NaN), chunk('audio', -1), chunk('audio', 1, 0),
    chunk('audio', 1, Infinity), chunk('audio', 1, 1001), chunk('', 0)]) {
    assert.throws(() => gate.push(invalid), RangeError);
  }
  assert.deepEqual(gate.push(chunk('good', 0.01)).audio, ['good']);
  for (const options of [{ threshold: NaN }, { threshold: 0 }, { preRollMs: -1 }, { hangoverMs: Infinity }]) {
    assert.throws(() => new MicrophoneSilenceGate(options), RangeError);
  }
});

test('background voices also pass; this energy gate does not claim speaker discrimination', () => {
  const gate = new MicrophoneSilenceGate();
  assert.deepEqual(gate.push(chunk('background-speech', 0.01)).audio, ['background-speech']);
});
