/** Person 3: alternate capture and playback; do not listen to the assistant itself. */
export interface VoiceAdapter {
  listen(onUtterance: (text: string) => void): Promise<void>;
  speak(text: string): Promise<void>;
  stop(): Promise<void>;
}
