import assert from 'node:assert/strict';
import test from 'node:test';
import { FeedbackSpeechPolicy } from '../src/vision/feedbackPolicy';
import type { FormReport } from '../src/live/protocol';

function report(time: number, status: FormReport['status'] = 'needs_adjustment', changes: Partial<FormReport> = {}): FormReport {
  return { sequenceId: 'sequence', stepIndex: 0, observedAt: time, status, checkId: 'left-elbow',
    message: status, mode: 'practice', ...changes };
}

function sample(policy: FeedbackSpeechPolicy, times: number[], status: FormReport['status'], changes: Partial<FormReport> = {}) {
  return times.map(time => policy.shouldSpeak(report(time, status, changes), time));
}

test('speech waits for a sustained correction and never repeats an unchanged correction', () => {
  const policy = new FeedbackSpeechPolicy();
  assert.deepEqual(sample(policy, [1000, 1400, 1800], 'needs_adjustment'), [false, false, true]);
  assert.deepEqual(sample(policy, [2400, 3000, 3800, 4600, 5400, 6200], 'needs_adjustment'), Array(6).fill(false));
});

test('jitter does not speak and sustained recovery waits for the global cooldown', () => {
  const policy = new FeedbackSpeechPolicy();
  for (let time = 1000; time <= 3000; time += 100) {
    assert.equal(policy.shouldSpeak(report(time, time % 200 ? 'aligned' : 'needs_adjustment'), time), false);
  }
  assert.equal(policy.shouldSpeak(report(3200, 'aligned'), 3200), false);
  assert.deepEqual(sample(policy, [3400, 3800, 4200], 'needs_adjustment'), [false, false, true]);
  assert.deepEqual(sample(policy, [4600, 5000, 5400, 5800, 6200, 6600, 7000, 7400, 7800], 'aligned'), Array(9).fill(false));
  assert.equal(policy.shouldSpeak(report(8200, 'aligned'), 8200), true);
  assert.equal(policy.shouldSpeak(report(8600, 'aligned'), 8600), false);
});

test('brief occlusion remains silent and persistent loss speaks once after two seconds', () => {
  const policy = new FeedbackSpeechPolicy();
  assert.deepEqual(sample(policy, [1000, 1500, 2000], 'not_observable'), [false, false, false]);
  assert.equal(policy.shouldSpeak(report(2100, 'aligned'), 2100), false);
  assert.deepEqual(sample(policy, [2400, 2900, 3400, 3900, 4400], 'not_observable'), [false, false, false, false, true]);
  assert.equal(policy.shouldSpeak(report(4900, 'not_observable'), 4900), false);
});

test('sequence and step changes reset candidate evidence but retain the spoken cooldown', () => {
  const policy = new FeedbackSpeechPolicy();
  assert.deepEqual(sample(policy, [1000, 1400, 1800], 'needs_adjustment'), [false, false, true]);
  assert.deepEqual(sample(policy, [2000, 2400, 2800], 'needs_adjustment', { stepIndex: 1 }), [false, false, false]);
  assert.deepEqual(sample(policy, [3200, 3600, 4000, 4400, 4800, 5200, 5600], 'needs_adjustment', { sequenceId: 'replacement' }), Array(7).fill(false));
  assert.equal(policy.shouldSpeak(report(6000, 'needs_adjustment', { sequenceId: 'replacement' }), 6000), true);
});

test('check or message changes require their own stable evidence', () => {
  const policy = new FeedbackSpeechPolicy();
  assert.equal(policy.shouldSpeak(report(1000), 1000), false);
  assert.equal(policy.shouldSpeak(report(1400, 'needs_adjustment', { checkId: 'right-elbow' }), 1400), false);
  assert.equal(policy.shouldSpeak(report(1800, 'needs_adjustment', { checkId: 'right-elbow', message: 'Raise the forearm.' }), 1800), false);
  assert.deepEqual(sample(policy, [2200, 2600], 'needs_adjustment', { checkId: 'right-elbow', message: 'Raise the forearm.' }), [false, true]);
});

test('repeated frames, stale evidence, future data and a stalled stream cannot build speech evidence', () => {
  const policy = new FeedbackSpeechPolicy();
  for (const now of [1000, 1200, 1400, 1800]) assert.equal(policy.shouldSpeak(report(1000), now), false);
  assert.equal(policy.shouldSpeak(report(1000), 3000), false);
  assert.equal(policy.shouldSpeak(report(4000), 3100), false);
  assert.equal(policy.shouldSpeak(report(3200), 3200), false);
  assert.equal(policy.shouldSpeak(report(4500), 4500), false, 'A >1s gap starts new evidence.');
  assert.deepEqual(sample(policy, [4900, 5300], 'needs_adjustment'), [false, true]);
});

test('demonstration, unavailable and null reports cannot speak or preserve pending evidence', () => {
  const policy = new FeedbackSpeechPolicy();
  assert.equal(policy.shouldSpeak(report(1000), 1000), false);
  assert.equal(policy.shouldSpeak(report(1400, 'needs_adjustment', { mode: 'demonstration' }), 1400), false);
  assert.equal(policy.shouldSpeak(report(1800), 1800), false);
  assert.equal(policy.shouldSpeak(null, 2000), false);
  assert.equal(policy.shouldSpeak(report(2200, 'unavailable'), 2200), false);
  assert.equal(policy.shouldSpeak(report(2400, 'aligned', { checkId: null }), 2400), false);
  assert.deepEqual(sample(policy, [2600, 3000, 3400], 'needs_adjustment'), [false, false, true]);
  policy.shouldSpeak(null, 3500);
  assert.deepEqual(sample(policy, [3600, 4000, 4400], 'needs_adjustment'), [false, false, false], 'Null cannot bypass the spoken cooldown.');
});

test('backward clocks invalidate evidence and reset permits a clean new session clock', () => {
  const policy = new FeedbackSpeechPolicy();
  assert.deepEqual(sample(policy, [1000, 1400, 1800], 'needs_adjustment'), [false, false, true]);
  assert.equal(policy.shouldSpeak(report(1700, 'aligned'), 1700), false);
  assert.equal(policy.shouldSpeak(report(2200, 'aligned'), Number.NaN), false);
  assert.deepEqual(sample(policy, [2300, 2700, 3100, 3500], 'aligned'), [false, false, false, false]);
  policy.reset();
  assert.deepEqual(sample(policy, [100, 500, 900], 'needs_adjustment'), [false, false, true]);
});
