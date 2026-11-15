export interface LiveAudio {
  start(onAudio: (base64: string, peak: number, durationMs?: number) => void, onError: (message: string) => void, onWarning?: (message: string) => void): Promise<void>;
  enqueue(base64: string): void;
  interrupt(): void;
  finishReply(): void;
  testSpeaker(): void;
  stop(): Promise<void>;
}
