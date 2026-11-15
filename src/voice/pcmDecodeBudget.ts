/** Reserve PCM16/24kHz/mono duration before retaining chunks in a decode chain. */
export class PcmDecodeBudget {
  private generation = 0;
  private pending = 0;
  get seconds() { return this.pending; }
  reserve(base64: string, queuedSeconds: number) {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const bytes = base64.length / 4 * 3 - padding;
    const seconds = bytes / 48000;
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes % 2 !== 0 || this.pending + queuedSeconds + seconds > 15) {
      throw new Error('Audio playback fell behind or received invalid PCM. Restart the live session.');
    }
    this.pending += seconds;
    const epoch = this.generation;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (epoch === this.generation) this.pending = Math.max(0, this.pending - seconds);
    };
  }
  reset() { this.generation++; this.pending = 0; }
}
