export interface LiveAudio {
  start(onAudio: (base64: string, peak: number) => void, onError: (message: string) => void): Promise<void>;
  enqueue(base64: string): void;
  interrupt(): void;
  testSpeaker(): void;
  stop(): Promise<void>;
}
