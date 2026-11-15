import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { DeviceVoiceAdapter, type RecognitionDriver, type SpeechDriver } from './DeviceVoiceAdapter';

/**
 * Native bridges for the React Native Android development build.
 * Do not import this module in the web build or Expo Go.
 */
const recognizer: RecognitionDriver = {
  isAvailable: () => ExpoSpeechRecognitionModule.isRecognitionAvailable(),
  getPermission: () => ExpoSpeechRecognitionModule.getPermissionsAsync(),
  requestPermission: () => ExpoSpeechRecognitionModule.requestPermissionsAsync(),
  onStart: (fn) => ExpoSpeechRecognitionModule.addListener('start', fn),
  onEnd: (fn) => ExpoSpeechRecognitionModule.addListener('end', fn),
  onResult: (fn) => ExpoSpeechRecognitionModule.addListener('result', fn),
  onError: (fn) => ExpoSpeechRecognitionModule.addListener('error', fn),
  start: (options) => ExpoSpeechRecognitionModule.start(options),
  abort: async () => {
    if (await ExpoSpeechRecognitionModule.getStateAsync() === 'inactive') return;
    await new Promise<void>((resolve, reject) => {
      const subscription = ExpoSpeechRecognitionModule.addListener('end', () => {
        clearTimeout(timer);
        subscription.remove();
        resolve();
      });
      const timer = setTimeout(() => {
        subscription.remove();
        reject(new Error('Speech recognizer did not release the microphone.'));
      }, 3000);
      try { ExpoSpeechRecognitionModule.abort(); }
      catch (error) { clearTimeout(timer); subscription.remove(); reject(error); }
    });
  },
};

const speaker: SpeechDriver = {
  get maxSpeechInputLength() { return Speech.maxSpeechInputLength; },
  speak: (text, options) => Speech.speak(text, options),
  stop: () => Speech.stop(),
};

export function createExpoVoiceAdapter() {
  return new DeviceVoiceAdapter(recognizer, speaker);
}
