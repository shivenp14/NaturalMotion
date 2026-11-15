// Allow complete conversational replies generated faster than real-time playback.
export const MAX_BUFFERED_AUDIO_SECONDS = 60;

/** Reserve PCM16/24kHz/mono duration before retaining chunks in a decode chain. */
export class AudioBacklogError extends Error {
  constructor() { super('Audio playback fell behind.'); }
}
export class PcmDecodeBudget {
  private generation = 0;
  private pending = 0;
  private droppingReply = false;
  get seconds() { return this.pending; }
  reserve(base64: string, queuedSeconds: number) {
    if (this.droppingReply) return null;
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const bytes = base64.length / 4 * 3 - padding;
    const seconds = bytes / 48000;
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes % 2 !== 0) throw new Error('Invalid PCM audio received. Restart the live session.');
    if (this.pending + queuedSeconds + seconds > MAX_BUFFERED_AUDIO_SECONDS) throw new AudioBacklogError();
    this.pending += seconds;
    const epoch = this.generation;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (epoch === this.generation) this.pending = Math.max(0, this.pending - seconds);
    };
  }
  reset() { this.generation++; this.pending = 0; this.droppingReply = false; }
  discardReply() { this.reset(); this.droppingReply = true; }
  finishReply() { this.droppingReply = false; }
}
