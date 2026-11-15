import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveCompletion } from '../scripts/liveCompletion';
import { resolveReasoningEffort } from '../server/modelOptions';

test('early acknowledgment cannot complete a test while its movement plan is pending', () => {
  const completion = new LiveCompletion();
  assert.equal(completion.update({ type: 'planning', active: true }), false);
  assert.equal(completion.update({ type: 'audio', data: 'AAAA' }), false);
  assert.equal(completion.update({ type: 'turn_complete' }), false);
  assert.equal(completion.update({ type: 'planning', active: false }), false);
  assert.equal(completion.update({ type: 'turn_complete' }), true);
});

test('reasoning defaults remain low for GPT-6 and can be omitted for other model overrides', () => {
  assert.equal(resolveReasoningEffort('gpt-6-luna'), 'low');
  assert.equal(resolveReasoningEffort('gpt-4.1'), undefined);
  assert.equal(resolveReasoningEffort('gpt-6-luna', 'omit'), undefined);
  assert.equal(resolveReasoningEffort('custom', 'low'), 'low');
  assert.throws(() => resolveReasoningEffort('custom', 'unexpected'));
});
