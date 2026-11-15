/** Person 3: alternate capture and playback; never transcribe assistant speech. */
export type ListenEnd =
  | { reason: 'silence' }
  | { reason: 'error'; error: Error };

export interface VoiceAdapter {
  /** Resolves when the recognizer signals it has started listening. */
  listen(
    onUtterance: (text: string) => void,
    onEnd?: (event: ListenEnd) => void,
  ): Promise<void>;
  /** Resolves only when TTS finishes, not when playback is queued. */
  speak(text: string): Promise<void>;
  /** Cancels recognition and speech, including in-flight starts. */
  stop(): Promise<void>;
}
