import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceVoiceAdapter, VoiceCancelledError,
  type RecognitionDriver, type SpeechDriver } from '../src/voice/DeviceVoiceAdapter';
import { TurnCoordinator } from '../src/voice/turnCoordinator';
import type { AgentAdapter } from '../src/agent/types';
import type { SessionPhase } from '../src/shared/contracts';

type Result = { isFinal: boolean; results: readonly { transcript?: string }[] };
type NativeError = { error: string; message?: string };
type ListenerMap = {
  start: () => void;
  end: () => void;
  result: (value: Result) => void;
  error: (value: NativeError) => void;
};
class FakeRecognizer implements RecognitionDriver {
  permitted = true;
  canAskAgain = true;
  available = true;
  autoStart = true;
  requested = 0;
  started = 0;
  aborted = 0;
  listeners: { [K in keyof ListenerMap]: Set<ListenerMap[K]> } = {
    start: new Set(), result: new Set(), error: new Set(), end: new Set(),
  };
  isAvailable() { return this.available; }
  async getPermission() { return { granted: this.permitted, canAskAgain: this.canAskAgain }; }
  async requestPermission() { this.requested++; return { granted: this.permitted, canAskAgain: this.canAskAgain }; }
  onStart(callback: () => void) { this.listeners.start.add(callback); return { remove: () => this.listeners.start.delete(callback) }; }
  onEnd(callback: () => void) { this.listeners.end.add(callback); return { remove: () => this.listeners.end.delete(callback) }; }
  onResult(callback: (ev: Result) => void) { this.listeners.result.add(callback); return { remove: () => this.listeners.result.delete(callback) }; }
  onError(callback: (ev: NativeError) => void) { this.listeners.error.add(callback); return { remove: () => this.listeners.error.delete(callback) }; }
  start(options: { lang: string; continuous: false; interimResults: true; maxAlternatives: 1 }) {
    assert.equal(options.continuous, false);
    this.started++;
    if (this.autoStart) this.emit('start');
  }
  abort() { this.aborted++; }
  emit<K extends keyof ListenerMap>(name: K, payload?: Parameters<ListenerMap[K]>[0]) {
    const listeners = [...this.listeners[name]] as ((value?: unknown) => void)[];
    for (const listener of listeners) listener(payload);
  }
  listenerCount() { return Object.values(this.listeners).reduce((sum, v) => sum + v.size, 0); }
}
class FakeSpeech implements SpeechDriver {
  maxSpeechInputLength = 300;
  spoken: string[] = [];
  stopped = 0;
  callbacks: Parameters<SpeechDriver['speak']>[1] | null = null;
  speak(text: string, options: Parameters<SpeechDriver['speak']>[1]) {
    this.spoken.push(text);
    this.callbacks = options;
  }
  async stop() { this.stopped++; this.callbacks?.onStopped(); this.callbacks = null; }
  complete() { this.callbacks?.onDone(); this.callbacks = null; }
}
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test('permission denied prevents recognition and cleans up', async () => {
  const recognizer = new FakeRecognizer();
  const speech = new FakeSpeech();
  recognizer.permitted = false;
  recognizer.canAskAgain = false;
  const adapter = new DeviceVoiceAdapter(recognizer, speech);
  await assert.rejects(adapter.listen(() => {}), /permission was denied/);
  assert.equal(recognizer.started, 0);
  assert.equal(recognizer.listenerCount(), 0);
});

test('final transcript delivered once, interim ignored and listeners cleared on stop', async () => {
  const recognizer = new FakeRecognizer();
  const adapter = new DeviceVoiceAdapter(recognizer, new FakeSpeech());
  const received: string[] = [];
  await adapter.listen(value => received.push(value));
  recognizer.emit('result', { isFinal: false, results: [{ transcript: 'partial' }] });
  recognizer.emit('result', { isFinal: true, results: [{ transcript: '  show me a stretch  ' }] });
  recognizer.emit('result', { isFinal: true, results: [{ transcript: 'duplicate' }] });
  assert.deepEqual(received, ['show me a stretch']);
  await adapter.stop();
  assert.equal(recognizer.aborted, 1);
  assert.equal(recognizer.listenerCount(), 0);
});

test('silence reports idle once, allowing a fresh recognition session', async () => {
  const recognizer = new FakeRecognizer();
  const adapter = new DeviceVoiceAdapter(recognizer, new FakeSpeech());
  const events: string[] = [];
  await adapter.listen(() => {}, event => events.push(event.reason));
  recognizer.emit('error', { error: 'no-speech' });
  recognizer.emit('end');
  assert.deepEqual(events, ['silence']);
  assert.equal(recognizer.listenerCount(), 0);
  await adapter.listen(() => {});
  assert.equal(recognizer.started, 2);
  await adapter.stop();
});

test('empty final is treated as no recognized request', async () => {
  const recognizer = new FakeRecognizer();
  const adapter = new DeviceVoiceAdapter(recognizer, new FakeSpeech());
  const received: string[] = [];
  const events: string[] = [];
  await adapter.listen(text => received.push(text), event => events.push(event.reason));
  recognizer.emit('result', { isFinal: true, results: [{ transcript: '  ' }] });
  recognizer.emit('end');
  assert.deepEqual(received, []);
  assert.deepEqual(events, ['silence']);
});

test('missing speech service is reported before requesting permission', async () => {
  const recognizer = new FakeRecognizer();
  recognizer.available = false;
  const adapter = new DeviceVoiceAdapter(recognizer, new FakeSpeech());
  await assert.rejects(adapter.listen(() => {}), /not available/);
  assert.equal(recognizer.started, 0);
});

test('native error is surfaced and does not silently retry', async () => {
  const recognizer = new FakeRecognizer();
  const adapter = new DeviceVoiceAdapter(recognizer, new FakeSpeech());
  let error = '';
  await adapter.listen(() => {}, event => {
    if (event.reason === 'error') error = event.error.message;
  });
  recognizer.emit('error', { error: 'not-allowed', message: 'Permission revoked' });
  assert.equal(error, 'Permission revoked');
});

test('TTS only resolves on onDone, and stop rejects pending speech', async () => {
  const recognizer = new FakeRecognizer();
  const speech = new FakeSpeech();
  const adapter = new DeviceVoiceAdapter(recognizer, speech);
  let finished = false;
  const speaking = adapter.speak('Try slowing down.').then(() => { finished = true; });
  await flush();
  assert.equal(finished, false);
  speech.complete();
  await speaking;
  assert.equal(finished, true);
  const interrupted = adapter.speak('Second sentence.');
  const checked = assert.rejects(interrupted, (error: unknown) => error instanceof VoiceCancelledError);
  await adapter.stop();
  await checked;
  assert.equal(speech.stopped, 1);
});

test('stop during permission/start prevents late recognizer start', async () => {
  const recognizer = new FakeRecognizer();
  recognizer.autoStart = false;
  const adapter = new DeviceVoiceAdapter(recognizer, new FakeSpeech());
  const pending = adapter.listen(() => {});
  await flush();
  const rejection = assert.rejects(pending, (error: unknown) => error instanceof VoiceCancelledError);
  await adapter.stop();
  await rejection;
  recognizer.emit('start');
  assert.equal(recognizer.listenerCount(), 0);
});

test('hands-free coordinator sends a completed utterance to agent and speaks reply', async () => {
  const recognizer = new FakeRecognizer();
  const speech = new FakeSpeech();
  const adapter = new DeviceVoiceAdapter(recognizer, speech);
  const phases: SessionPhase[] = [];
  const utterances: string[] = [];
  const displayed: string[] = [];
  const agent: AgentAdapter = { respond: async ({ utterance }) => {
    utterances.push(utterance);
    return { decisionId: 'echo', trigger: { type: 'user_utterance', id: 'utterance' },
      actions: [{ type: 'speak_text', text: `You said ${utterance}` }] };
  } };
  const coordinator = new TurnCoordinator({
    voice: adapter, agent,
    getContext: () => ({ catalog: [], currentSequence: null }),
    onSequence: () => {}, onPhase: phase => phases.push(phase),
    onTranscript: text => displayed.push(`user: ${text}`),
    onSpokenText: text => displayed.push(`guide: ${text}`),
  });
  await coordinator.start();
  recognizer.emit('result', { isFinal: true, results: [{ transcript: 'move slower' }] });
  await flush();
  assert.deepEqual(utterances, ['move slower']);
  assert.deepEqual(speech.spoken, ['You said move slower']);
  assert.deepEqual(displayed, ['user: move slower', 'guide: You said move slower']);
  speech.complete();
  await flush();
  assert.equal(recognizer.started, 2);
  assert.equal(phases.at(-1), 'listening');
  await coordinator.stop();
  assert.equal(phases.at(-1), 'idle');
});

test('stop settles listen immediately while permission is still pending', async () => {
  const recognizer = new FakeRecognizer();
  let permission!: (value: { granted: boolean; canAskAgain: boolean }) => void;
  recognizer.getPermission = () => new Promise(resolve => { permission = resolve; });
  const adapter = new DeviceVoiceAdapter(recognizer, new FakeSpeech());
  const listening = assert.rejects(adapter.listen(() => {}), VoiceCancelledError);
  await adapter.stop();
  await listening;
  permission({ granted: true, canAskAgain: true });
  await flush();
  assert.equal(recognizer.started, 0);
});

test('start timeout rejects and removes all native listeners', async () => {
  const recognizer = new FakeRecognizer();
  recognizer.autoStart = false;
  const adapter = new DeviceVoiceAdapter(recognizer, new FakeSpeech(), { recognitionStartTimeoutMs: 5 });
  await assert.rejects(adapter.listen(() => {}), /did not start/);
  assert.equal(recognizer.listenerCount(), 0);
  await adapter.stop();
});

test('new listening or speech cannot overlap pending native shutdown', async () => {
  const recognizer = new FakeRecognizer();
  const speech = new FakeSpeech();
  let release!: () => void;
  speech.stop = () => new Promise(resolve => { release = resolve; });
  const adapter = new DeviceVoiceAdapter(recognizer, speech);
  await adapter.listen(() => {});
  const stopping = adapter.stop();
  await flush();
  await assert.rejects(adapter.listen(() => {}), /another voice operation/);
  await assert.rejects(adapter.speak('hello'), /Stop recognition/);
  release();
  await stopping;
});

test('invalid action batch produces no speech or sequence and stops the turn', async () => {
  const recognizer = new FakeRecognizer();
  const speech = new FakeSpeech();
  let sequences = 0;
  const displayed: string[] = [];
  const errors: unknown[] = [];
  const coordinator = new TurnCoordinator({
    voice: new DeviceVoiceAdapter(recognizer, speech),
    agent: { respond: async () => ({ decisionId: 'bad', trigger: { type: 'user_utterance', id: 'u' },
      actions: [{ type: 'speak_text', text: 'Must not speak' }, { type: 'play_sequence', sequence: {} }] }) },
    getContext: () => ({ catalog: [], currentSequence: null }),
    onSequence: () => { sequences++; }, onPhase: () => {}, onError: error => errors.push(error),
    onSpokenText: text => displayed.push(text),
  });
  await coordinator.start();
  recognizer.emit('result', { isFinal: true, results: [{ transcript: 'test' }] });
  await flush();
  assert.equal(sequences, 0);
  assert.deepEqual(displayed, []);
  assert.deepEqual(speech.spoken, []);
  assert.equal(errors.length, 1);
  assert.equal(recognizer.listenerCount(), 0);
});

test('cancelled agent response cannot speak or interfere with a restarted turn', async () => {
  const recognizer = new FakeRecognizer();
  const speech = new FakeSpeech();
  const replies: ((value: unknown) => void)[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const coordinator = new TurnCoordinator({
    voice: new DeviceVoiceAdapter(recognizer, speech),
    agent: { respond: (_request, signal) => { signals.push(signal); return new Promise(resolve => replies.push(resolve)); } },
    getContext: () => ({ catalog: [], currentSequence: null }), onSequence: () => {}, onPhase: () => {},
  });
  await coordinator.start();
  recognizer.emit('result', { isFinal: true, results: [{ transcript: 'old' }] });
  await flush();
  await coordinator.stop();
  assert.equal(signals[0]?.aborted, true);
  await coordinator.start();
  recognizer.emit('result', { isFinal: true, results: [{ transcript: 'new' }] });
  await flush();
  const reply = (text: string) => ({ decisionId: text, trigger: { type: 'user_utterance', id: text }, actions: [{ type: 'speak_text', text }] });
  replies[0](reply('old'));
  await flush();
  assert.deepEqual(speech.spoken, []);
  replies[1](reply('new'));
  await flush();
  assert.deepEqual(speech.spoken, ['new']);
  speech.complete();
  await flush();
  assert.equal(recognizer.started, 3);
  await coordinator.stop();
});

test('silence retries are bounded and stop cancels queued retries', async () => {
  const recognizer = new FakeRecognizer();
  const phases: SessionPhase[] = [];
  const errors: unknown[] = [];
  const coordinator = new TurnCoordinator({
    voice: new DeviceVoiceAdapter(recognizer, new FakeSpeech()),
    agent: { respond: async () => { throw new Error('Unexpected agent call'); } },
    getContext: () => ({ catalog: [], currentSequence: null }), onSequence: () => {},
    onPhase: phase => phases.push(phase), onError: error => errors.push(error), silenceRetryDelayMs: 0,
  });
  await coordinator.start();
  for (let i = 0; i < 5; i++) { recognizer.emit('end'); await flush(); }
  assert.equal(recognizer.started, 5);
  assert.equal(phases.at(-1), 'idle');
  assert.equal(errors.length, 1);
  await coordinator.start();
  recognizer.emit('end');
  await coordinator.stop();
  await flush();
  assert.equal(recognizer.started, 6);
});

test('session controls notify shutdown completion once after pending native cleanup', async () => {
  let utterance!: (text: string) => void;
  let release!: () => void;
  let stopCalls = 0; let stopped = 0;
  const shutdown = new Promise<void>(resolve => { release = resolve; });
  const phases: SessionPhase[] = [];
  const coordinator = new TurnCoordinator({
    voice: { listen: async callback => { utterance = callback; }, speak: async () => {},
      stop: async () => { if (++stopCalls >= 2) await shutdown; } },
    agent: { respond: async () => ({ decisionId: 'stop', trigger: { type: 'user_utterance', id: 'stop' },
      actions: [{ type: 'stop_session', reason: 'user_request' }] }) },
    getContext: () => ({ catalog: [], currentSequence: null }), onSequence: () => {}, onPlaybackAction: () => {},
    onPhase: phase => phases.push(phase), onStopped: () => { stopped++; },
  });
  await coordinator.start(); utterance('Stop.'); await flush();
  assert.equal(stopCalls, 2); assert.equal(stopped, 0); assert.notEqual(phases.at(-1), 'idle');
  const repeated = coordinator.stop(); assert.equal(stopCalls, 2);
  release(); await repeated; await flush();
  assert.equal(stopped, 1); assert.equal(phases.at(-1), 'idle');
});

test('unsupported playback actions reject the full batch before sequence dispatch', async () => {
  const recognizer = new FakeRecognizer(); let committed = 0; const errors: unknown[] = [];
  const catalog = [{ id: 'fixture', label: 'Fixture', parameters: { angle: { minimum: 0, maximum: 2 } },
    muscleRegionIds: [], cameraView: 'test', requiredLandmarks: [], supportedCheckIds: [] }];
  const sequence = { id: 'fixture', steps: [{ componentId: 'fixture', parameters: { angle: 1 } }] };
  const coordinator = new TurnCoordinator({ voice: new DeviceVoiceAdapter(recognizer, new FakeSpeech()),
    agent: { respond: async () => ({ decisionId: 'fixture', trigger: { type: 'user_utterance', id: 'fixture' }, actions: [
      { type: 'play_sequence', sequence }, { type: 'replay_demonstration', stepIndex: 0 },
    ] }) }, getContext: () => ({ catalog, currentSequence: null }), onSequence: () => { committed++; },
    onPlaybackAction: () => { throw new Error('Must not dispatch.'); }, supportedPlaybackActions: ['pause_session', 'stop_session'],
    onPhase: () => {}, onError: error => errors.push(error),
  });
  await coordinator.start(); recognizer.emit('result', { isFinal: true, results: [{ transcript: 'Demonstrate.' }] }); await flush();
  assert.equal(committed, 0); assert.equal(errors.length, 1); await coordinator.stop();
});
