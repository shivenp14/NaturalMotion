import { AudioContext, AudioManager, AudioRecorder, type AudioBufferQueueSourceNode } from 'react-native-audio-api';
import type { LiveAudio } from './LiveAudio.types';
import { encodePcm16 } from './pcm';
import { AudioBacklogError, MAX_BUFFERED_AUDIO_SECONDS, PcmDecodeBudget } from './pcmDecodeBudget';

export async function requestLiveMicrophonePermission() {
  if (await AudioManager.checkRecordingPermissions() === 'Granted') return;
  if (await AudioManager.requestRecordingPermissions() !== 'Granted') throw new Error('Microphone permission is required for live conversation.');
}

export function createLiveAudio(): LiveAudio {
  const recorder = new AudioRecorder({ androidInputPreset: 'voiceCommunication', iosVoiceProcessing: true });
  let context: AudioContext | null = null;
  let queue: AudioBufferQueueSourceNode | null = null;
  let started = false;
  let active = false;
  let stopped = false;
  let generation = 0;
  let decoding = Promise.resolve();
  let onFailure: (message: string) => void = () => {};
  let onWarning: (message: string) => void = () => {};
  const durations = new Map<string, number>();
  let queuedSeconds = 0;
  const pending = new PcmDecodeBudget();
  function failOutput(error: unknown, epoch: number) {
    if (!active || generation !== epoch) return;
    if (__DEV__) console.warn('[LiveAudio]', error instanceof Error ? error.message : 'Output failed',
      { pendingSeconds: pending.seconds, queuedSeconds });
    if (error instanceof AudioBacklogError) {
      // Keep already buffered speech playing instead of cutting it off mid-sentence.
      pending.discardReply();
      onWarning('Some spoken audio was skipped. The session is still connected; ask me to repeat if needed.');
    } else onFailure(error instanceof Error ? error.message : 'Audio playback failed.');
  }
  function enqueue(base64: string) {
    const epoch = generation;
    const current = context;
    if (!active || !current) return;
    let release: () => void;
    try { const reserved = pending.reserve(base64, queuedSeconds); if (!reserved) return; release = reserved; }
    catch (error) { failOutput(error, epoch); return; }
    decoding = decoding.then(async () => {
      if (!active || generation !== epoch || context !== current) return;
      const buffer = await current.decodePCMInBase64(base64, 24000, 1);
      if (!active || generation !== epoch || !queue) return;
      release();
      if (pending.seconds + queuedSeconds + buffer.duration > MAX_BUFFERED_AUDIO_SECONDS) throw new AudioBacklogError();
      const id = queue.enqueueBuffer(buffer);
      durations.set(id, buffer.duration); queuedSeconds += buffer.duration;
      if (!started) { queue.start(); started = true; }
    }).catch(error => failOutput(error, epoch)).finally(release);
  }
  function interrupt() {
    generation++; queue?.clearBuffers(); durations.clear(); queuedSeconds = 0; pending.reset();
    decoding = Promise.resolve();
  }
  return {
    async start(onAudio, onError, warning = () => {}) {
      if (stopped) throw new Error('Audio session was cancelled.');
      onFailure = onError;
      onWarning = warning;
      AudioManager.setSystemOptions({ ios: { category: 'playAndRecord', mode: 'voiceChat', options: ['defaultToSpeaker'] },
        android: { mode: 'inCommunication', communicationDevice: 'speaker' } });
      await AudioManager.setAudioSessionActivity(true);
      if (stopped) { await AudioManager.setAudioSessionActivity(false); return; }
      // Android's default low-latency MMAP output is rejected on the test phone.
      // Balanced output keeps communication routing with a more compatible buffer.
      context = new AudioContext({ sampleRate: 24000, androidOutputProfile: 'voiceCommunication', latencyHint: 'balanced' });
      const startingContext = context;
      await startingContext.resume();
      if (stopped || context !== startingContext) return;
      queue = context.createBufferQueueSource(); queue.connect(context.destination);
      queue.onbufferended = ({ bufferId }) => {
        queuedSeconds = Math.max(0, queuedSeconds - (durations.get(bufferId) ?? 0)); durations.delete(bufferId);
      };
      active = true;
      const configured = recorder.onAudioReady({ sampleRate: 16000, bufferLength: 1600, channelCount: 1 }, ({ buffer, numFrames }) => {
        if (!active) return;
        if (buffer.sampleRate !== 16000) { onError('Microphone did not produce the required 16 kHz stream.'); return; }
        const samples = buffer.getChannelData(0).subarray(0, numFrames);
        let peak = 0; for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        onAudio(encodePcm16(samples), peak, numFrames / 16000 * 1000);
      });
      if (configured.status === 'error') throw new Error(configured.message);
      recorder.onError(() => { if (active) onError('Microphone recording failed.'); });
      const result = await recorder.start();
      if (result.status === 'error') throw new Error(result.message);
      if (!active) await recorder.stop();
    },
    enqueue, interrupt, finishReply: () => pending.finishReply(),
    testSpeaker() {
      const samples = new Float32Array(12000);
      samples.forEach((_, index) => { samples[index] = Math.sin(2 * Math.PI * 440 * index / 24000) * 0.12; });
      enqueue(encodePcm16(samples));
    },
    async stop() {
      stopped = true;
      active = false; interrupt();
      recorder.clearOnAudioReady(); recorder.clearOnError();
      try { await recorder.stop(); }
      finally {
        try { if (started) queue?.stop(); } catch { /* Continue releasing the device. */ }
        try { queue?.disconnect(); } catch { /* Continue releasing the device. */ }
        queue = null;
        const previous = context; context = null;
        try { await previous?.close(); } finally { await AudioManager.setAudioSessionActivity(false); }
      }
    },
  };
}
