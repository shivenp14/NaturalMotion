import { AudioContext, AudioManager, AudioRecorder, type AudioBufferQueueSourceNode } from 'react-native-audio-api';
import type { LiveAudio } from './LiveAudio.types';
import { encodePcm16 } from './pcm';

export async function requestLiveMicrophonePermission() {
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
  const durations = new Map<string, number>();
  let queuedSeconds = 0;
  function enqueue(base64: string) {
    const epoch = generation;
    const current = context;
    if (!active || !current) return;
    decoding = decoding.then(async () => {
      if (!active || generation !== epoch || context !== current) return;
      const buffer = await current.decodePCMInBase64(base64, 24000, 1);
      if (!active || generation !== epoch || !queue) return;
      if (queuedSeconds + buffer.duration > 15) throw new Error('Audio playback fell behind. Restart the live session.');
      const id = queue.enqueueBuffer(buffer);
      durations.set(id, buffer.duration); queuedSeconds += buffer.duration;
      if (!started) { queue.start(); started = true; }
    }).catch(error => { if (active && generation === epoch) onFailure(error instanceof Error ? error.message : 'Audio playback failed.'); });
  }
  function interrupt() {
    generation++; queue?.clearBuffers(); durations.clear(); queuedSeconds = 0;
  }
  return {
    async start(onAudio, onError) {
      if (stopped) throw new Error('Audio session was cancelled.');
      onFailure = onError;
      AudioManager.setSystemOptions({ ios: { category: 'playAndRecord', mode: 'voiceChat', options: ['defaultToSpeaker'] },
        android: { mode: 'inCommunication', communicationDevice: 'speaker' } });
      await AudioManager.setAudioSessionActivity(true);
      if (stopped) { await AudioManager.setAudioSessionActivity(false); return; }
      context = new AudioContext({ sampleRate: 24000, androidOutputProfile: 'voiceCommunication' });
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
        onAudio(encodePcm16(samples), peak);
      });
      if (configured.status === 'error') throw new Error(configured.message);
      recorder.onError(() => { if (active) onError('Microphone recording failed.'); });
      const result = await recorder.start();
      if (result.status === 'error') throw new Error(result.message);
      if (!active) await recorder.stop();
    },
    enqueue, interrupt,
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
