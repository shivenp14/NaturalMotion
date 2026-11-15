export interface MicrophoneChunk {
  /** Opaque PCM payload; the gate does not decode or alter audio. */
  data: string;
  /** Absolute peak of the original normalized samples. */
  peak: number;
  /** Captured sample count / sample rate * 1000, not wall-clock time. */
  durationMs: number;
}

export interface MicrophoneGateResult {
  audio: string[];
  /** Send after audio, with provider automatic activity detection enabled. */
  audioStreamEnd: boolean;
}

export interface MicrophoneGateOptions {
  threshold?: number;
  preRollMs?: number;
  hangoverMs?: number;
}

/**
 * Suppresses only sustained near-silence. This is not speech recognition or a
 * foreground-speaker detector: noise, other speakers, and speaker echo can open
 * it. The deliberately low default (-66 dBFS peak) favors preserving quiet
 * speech over filtering noise. Tune only with actual microphone recordings.
 *
 * Feed ordered capture chunks, including quiet chunks. Forward returned audio
 * in order, then send audioStreamEnd once when true. A subsequent audio message
 * reopens Gemini's stream. Reset when recording/session ownership changes.
 */
export class MicrophoneSilenceGate {
  private readonly threshold: number;
  private readonly preRollMs: number;
  private readonly hangoverMs: number;
  private buffered: MicrophoneChunk[] = [];
  private bufferedMs = 0;
  private quietMs = 0;
  private open = false;

  constructor(options: MicrophoneGateOptions = {}) {
    this.threshold = options.threshold ?? 0.0005;
    this.preRollMs = options.preRollMs ?? 300;
    this.hangoverMs = options.hangoverMs ?? 900;
    if (!Number.isFinite(this.threshold) || this.threshold <= 0 || this.threshold > 1 ||
      !Number.isFinite(this.preRollMs) || this.preRollMs < 0 || this.preRollMs > 2000 ||
      !Number.isFinite(this.hangoverMs) || this.hangoverMs <= 0 || this.hangoverMs > 5000) {
      throw new RangeError('Invalid microphone gate configuration.');
    }
  }

  push(chunk: MicrophoneChunk): MicrophoneGateResult {
    if (!chunk.data || !Number.isFinite(chunk.peak) || chunk.peak < 0 ||
      !Number.isFinite(chunk.durationMs) || chunk.durationMs <= 0 || chunk.durationMs > 1000) {
      throw new RangeError('Microphone chunks require valid audio, peak and captured duration.');
    }
    if (chunk.peak >= this.threshold) {
      const audio = this.open ? [chunk.data] : [...this.buffered.map(item => item.data), chunk.data];
      this.buffered = []; this.bufferedMs = 0;
      this.open = true; this.quietMs = 0;
      return { audio, audioStreamEnd: false };
    }
    if (this.open) {
      this.quietMs += chunk.durationMs;
      const audioStreamEnd = this.quietMs >= this.hangoverMs;
      if (audioStreamEnd) { this.open = false; this.quietMs = 0; }
      return { audio: [chunk.data], audioStreamEnd };
    }
    if (this.preRollMs > 0) {
      this.buffered.push({ ...chunk }); this.bufferedMs += chunk.durationMs;
      // Keep at least the requested history without splitting opaque PCM chunks.
      // Excess history is bounded by one capture chunk (at most 1000 ms).
      while (this.buffered.length > 1 && this.bufferedMs - this.buffered[0].durationMs >= this.preRollMs) {
        this.bufferedMs -= this.buffered.shift()!.durationMs;
      }
    }
    return { audio: [], audioStreamEnd: false };
  }

  reset(): void {
    this.buffered = []; this.bufferedMs = 0;
    this.quietMs = 0; this.open = false;
  }
}
