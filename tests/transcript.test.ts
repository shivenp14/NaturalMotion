import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationTranscript } from '../src/live/transcript';

test('model tool markup stays out of visible conversation during streaming', () => {
  const speech = 'Hello! Where are you feeling stiff?';
  const markup = '\n```json\n[{"name": "none", "arguments": {}}]\n```';
  for (let i = 0; i <= markup.length; i++) {
    assert.equal(conversationTranscript('assistant', speech + markup.slice(0, i)), speech);
  }
  assert.equal(conversationTranscript('assistant', speech + markup + ' Take your time.'), speech + ' Take your time.');
  assert.equal(conversationTranscript('assistant', speech + '[{"name":"none","arguments":{}}]'), speech);
});

test('ordinary speech and exact user words are preserved', () => {
  assert.equal(conversationTranscript('assistant', 'I can demonstrate one wall angel.'), 'I can demonstrate one wall angel.');
  assert.equal(conversationTranscript('user', 'I said ```json and then stopped.'), 'I said ```json and then stopped.');
});
