import type { ListenEnd, VoiceAdapter } from './types';

/** Small native boundaries allow deterministic tests without device audio. */
export interface RecognitionDriver {
  isAvailable(): boolean;
  getPermission(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  requestPermission(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  onStart(callback: () => void): { remove(): void };
  onResult(callback: (event: {
    isFinal: boolean;
    results: readonly { transcript?: string }[];
  }) => void): { remove(): void };
  onEnd(callback: () => void): { remove(): void };
  onError(callback: (event: { error: string; message?: string }) => void): { remove(): void };
  start(options: { lang: string; continuous: false; interimResults: true; maxAlternatives: 1 }): void;
  abort(): void | Promise<void>;
}

export interface SpeechDriver {
  maxSpeechInputLength?: number;
  speak(text: string, options: {
    language: string;
    rate: number;
    onDone(): void;
    onStopped(): void;
    onError(error: unknown): void;
  }): void;
  stop(): Promise<void>;
}

export type DeviceVoiceOptions = {
  language?: string;
  speechRate?: number;
  recognitionStartTimeoutMs?: number;
};

type ListeningSession = {
  id: number;
  listening: boolean;
  finalized: boolean;
  active: boolean;
  startResolved: boolean;
  resolveStart(): void;
  rejectStart(error: Error): void;
  cleanup(): void;
  onEnd?: (event: ListenEnd) => void;
};

type SpokenSession = { reject(error: Error): void; active: boolean };

export class VoiceCancelledError extends Error {
  constructor() {
    super('Voice operation cancelled.');
    this.name = 'VoiceCancelledError';
  }
}

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Concrete half-duplex voice adapter for the existing TurnCoordinator.
 *
 * Recognition uses one-shot sessions (not Android continuous mode); only
 * a FINAL event reaches the agent. TTS always waits for onDone.
 *
 * The coordinator must handle onEnd('silence') to restart listening. This is
 * deliberate: OS recognizers can stop after a quiet period with no result.
 */
export class DeviceVoiceAdapter implements VoiceAdapter {
  private session: ListeningSession | null = null;
  private speaking: SpokenSession | null = null;
  private serial = 0;
  private stopping: Promise<void> | null = null;
  private readonly language: string;
  private readonly speechRate: number;
  private readonly startTimeout: number;

  constructor(
    private readonly recognition: RecognitionDriver,
    private readonly speech: SpeechDriver,
    options: DeviceVoiceOptions = {},
  ) {
    this.language = options.language ?? 'en-US';
    this.speechRate = options.speechRate ?? 0.94;
    this.startTimeout = options.recognitionStartTimeoutMs ?? 8_000;
  }

  async listen(
    onUtterance: (text: string) => void,
    onEnd?: (event: ListenEnd) => void,
  ): Promise<void> {
    if (this.session || this.speaking || this.stopping) {
      throw new Error('Cannot listen while another voice operation is active.');
    }
    if (!this.recognition.isAvailable()) {
      throw new Error('Speech recognition is not available on this device.');
    }

    const id = ++this.serial;
    let resolveStart!: () => void;
    let rejectStart!: (error: Error) => void;
    const started = new Promise<void>((resolve, reject) => {
      resolveStart = resolve;
      rejectStart = reject;
    });
    // Cancellation can reject before the permission prompt resolves.
    void started.catch(() => {});
    const subscriptions: { remove(): void }[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const session: ListeningSession = {
      id,
      active: true,
      listening: false,
      finalized: false,
      startResolved: false,
      resolveStart: () => {
        if (session.startResolved) return;
        session.startResolved = true;
        session.listening = true;
        if (timer) clearTimeout(timer);
        resolveStart();
      },
      rejectStart: (error) => {
        if (session.startResolved) return;
        session.startResolved = true;
        if (timer) clearTimeout(timer);
        rejectStart(error);
      },
      cleanup: () => {
        for (const subscription of subscriptions.splice(0)) subscription.remove();
        if (timer) clearTimeout(timer);
        timer = null;
      },
      onEnd,
    };
    this.session = session;

    const finish = (event: ListenEnd | null) => {
      if (!session.active) return;
      session.active = false;
      session.cleanup();
      if (this.session === session) this.session = null;
      if (!session.startResolved) {
        session.rejectStart(event?.reason === 'error'
          ? event.error
          : new Error('Recognition ended before it started.'));
      } else if (event) {
        session.onEnd?.(event);
      }
    };

    void (async () => {
      try {
        let permission = await this.recognition.getPermission();
        if (session.active && !permission.granted && permission.canAskAgain !== false) {
          permission = await this.recognition.requestPermission();
        }
        if (!session.active) return;
        if (!permission.granted) {
          throw new Error('Microphone or speech recognition permission was denied.');
        }

        subscriptions.push(
          this.recognition.onStart(() => {
            if (session.active) session.resolveStart();
          }),
          this.recognition.onResult(({ isFinal, results }) => {
            if (!session.active || !isFinal || session.finalized) return;
            const transcript = results[0]?.transcript?.trim() ?? '';
            if (!transcript) return;
            session.finalized = true;
            // Deliver once; TurnCoordinator will call stop() before requesting AI.
            session.resolveStart();
            onUtterance(transcript);
          }),
          this.recognition.onEnd(() => {
            if (!session.active) return;
            finish(session.finalized ? null : { reason: 'silence' });
          }),
          this.recognition.onError((event) => {
            if (!session.active) return;
            const quiet = event.error === 'no-speech' || event.error === 'speech-timeout';
            finish(quiet
              ? { reason: 'silence' }
              : { reason: 'error', error: new Error(event.message || `Speech recognition: ${event.error}`) });
            // Error is terminal for the native one-shot recognizer.
          }),
        );
        timer = setTimeout(() => {
          if (!session.active || session.startResolved) return;
          finish({ reason: 'error', error: new Error('Speech recognizer did not start in time.') });
          void Promise.resolve().then(() => this.recognition.abort()).catch(() => {});
        }, this.startTimeout);
        this.recognition.start({
          lang: this.language,
          continuous: false,
          interimResults: true,
          maxAlternatives: 1,
        });
      } catch (error) {
        finish({ reason: 'error', error: toError(error) });
      }
    })();
    return started;
  }

  async speak(text: string): Promise<void> {
    const message = text.trim();
    if (!message) return;
    if (this.session || this.stopping) throw new Error('Stop recognition before playing speech.');
    if (this.speaking) throw new Error('Speech playback is already active.');
    if (this.speech.maxSpeechInputLength && message.length > this.speech.maxSpeechInputLength) {
      throw new Error('Spoken response exceeds the device TTS input limit.');
    }

    return new Promise<void>((resolve, reject) => {
      const session: SpokenSession = {
        active: true,
        reject(error) { reject(error); },
      };
      this.speaking = session;
      const complete = (error?: Error) => {
        if (!session.active) return;
        session.active = false;
        if (this.speaking === session) this.speaking = null;
        if (error) reject(error);
        else resolve();
      };
      try {
        this.speech.speak(message, {
          language: this.language,
          rate: this.speechRate,
          onDone: () => complete(),
          onStopped: () => complete(new VoiceCancelledError()),
          onError: (error) => complete(toError(error)),
        });
      } catch (error) {
        complete(toError(error));
      }
    });
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const session = this.session;
    if (session) {
      session.active = false;
      session.cleanup();
      this.session = null;
      session.rejectStart(new VoiceCancelledError());
    }
    const spoken = this.speaking;
    if (spoken) {
      spoken.active = false;
      this.speaking = null;
      spoken.reject(new VoiceCancelledError());
    }
    // Wait for the native recognizer to release the microphone before TTS/listen.
    const stopping = Promise.allSettled([
      Promise.resolve().then(() => this.recognition.abort()),
      Promise.resolve().then(() => this.speech.stop()),
    ]).then(results => {
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    });
    this.stopping = stopping;
    void stopping.then(() => { this.stopping = null; }, () => { this.stopping = null; });
    return stopping;
  }
}
