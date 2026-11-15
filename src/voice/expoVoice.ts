import type { VoiceAdapter } from './types';

/** Web fallback; native builds resolve expoVoice.native.ts instead. */
export function createExpoVoiceAdapter(): VoiceAdapter {
  throw new Error('The native voice test requires an Android development build.');
}
