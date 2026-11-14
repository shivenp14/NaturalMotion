import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentAdapter } from '../src/agent/types';
import type { ComponentDefinition, MovementSequence, SessionPhase } from '../src/shared/contracts';
import type { VoiceAdapter } from '../src/voice/types';
import { TurnCoordinator } from '../src/voice/turnCoordinator';

const catalog: ComponentDefinition[] = [{
  id: 'fixture', label: 'Test only',
  parameters: { repetitions: { minimum: 1, maximum: 3, integer: true } },
  muscleRegionIds: [], cameraView: 'test', requiredLandmarks: [], supportedCheckIds: [],
}];
const sequence: MovementSequence = {
  id: 'fixture-1', steps: [{ componentId: 'fixture', parameters: { repetitions: 2 } }],
};

class FakeVoice implements VoiceAdapter {
  callback: ((text: string) => void) | null = null;
  spoken: string[] = [];
  listenCalls = 0;

  async listen(callback: (text: string) => void) {
    this.callback = callback;
    this.listenCalls++;
  }
  async speak(message: string) { this.spoken.push(message); }
  async stop() { this.callback = null; }
  emit(text: string) { this.callback?.(text); }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('listens, validates model movement, speaks, then resumes listening', async () => {
  const voice = new FakeVoice();
  const phases: SessionPhase[] = [];
  const played: MovementSequence[] = [];
  const agent: AgentAdapter = { respond: async () => ({ speech: 'Moving now.', sequence }) };
  const turns = new TurnCoordinator({
    voice, agent, getContext: () => ({ catalog, currentSequence: null }),
    onPhase: (phase) => phases.push(phase), onSequence: (value) => played.push(value),
  });
  await turns.start();
  voice.emit('Show me the supported movement.');
  await flush();
  assert.deepEqual(played, [sequence]);
  assert.deepEqual(voice.spoken, ['Moving now.']);
  assert.deepEqual(phases, ['listening', 'thinking', 'speaking', 'listening']);
  assert.equal(voice.listenCalls, 2);
  await turns.stop();
  assert.equal(phases.at(-1), 'idle');
});

test('untrusted movement instructions are not passed to the renderer', async () => {
  const voice = new FakeVoice();
  const played: MovementSequence[] = [];
  const agent: AgentAdapter = { respond: async () => ({
    speech: 'Starting!', sequence: { id: 'bad', steps: [{ componentId: 'invented', parameters: {} }] },
  }) };
  const turns = new TurnCoordinator({
    voice, agent, getContext: () => ({ catalog, currentSequence: null }),
    onPhase: () => {}, onSequence: (value) => played.push(value),
  });
  await turns.start();
  voice.emit('Start');
  await flush();
  assert.deepEqual(played, []);
  assert.match(voice.spoken[0], /not available/);
  await turns.stop();
});

test('ignores empty utterances and stale callbacks after stop', async () => {
  const voice = new FakeVoice();
  let calls = 0;
  const agent: AgentAdapter = { respond: async () => { calls++; return { speech: 'hello' }; } };
  const turns = new TurnCoordinator({
    voice, agent, getContext: () => ({ catalog, currentSequence: null }),
    onPhase: () => {}, onSequence: () => {},
  });
  await turns.start();
  const stale = voice.callback;
  voice.emit('   ');
  await flush();
  assert.equal(calls, 0);
  await turns.stop();
  stale?.('after stop');
  await flush();
  assert.equal(calls, 0);
});
