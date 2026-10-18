import { v4 as uuidv4 } from 'uuid';
import type { SttAdapter, SttAdapterEvents, TranscriptSegment, AudioSessionStatus } from './types';

export class WebSpeechSttAdapter implements SttAdapter {
  readonly name = 'Web Speech Recognition';
  private recognition: any = null;
  private isListening = false;
  private isPaused = false;
  private events: Partial<SttAdapterEvents> = {};
  private restartTimeout: NodeJS.Timeout | null = null;
  private consecutiveErrors = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 2;

  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  setEvents(events: Partial<SttAdapterEvents>): void {
    this.events = { ...this.events, ...events };
  }

  async start(options?: { language?: string }): Promise<void> {
    if (!this.isSupported()) {
      const err = 'Speech recognition is not supported in this runtime environment.';
      this.events.onError?.(err);
      this.events.onStatusChange?.('error');
      throw new Error(err);
    }

    if (this.isListening) {
      return;
    }

    this.isListening = true;
    this.isPaused = false;
    this.consecutiveErrors = 0;
    this.initRecognition(options?.language || 'en-US');
  }

  private initRecognition(lang: string): void {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    try {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = lang;

      this.recognition.onstart = () => {
        if (!this.isPaused) {
          this.events.onStatusChange?.('listening');
        }
      };

      this.recognition.onresult = (event: any) => {
        if (this.isPaused) return;
        this.consecutiveErrors = 0;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0]?.transcript?.trim();
          const confidence = res[0]?.confidence;
          const isFinal = Boolean(res.isFinal);

          if (transcript) {
            const segment: TranscriptSegment = {
              id: uuidv4(),
              text: transcript,
              isFinal,
              timestamp: Date.now(),
              confidence: typeof confidence === 'number' ? confidence : undefined,
            };
            this.events.onTranscript?.(segment);
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        const error = event.error;
        console.warn('[STT] SpeechRecognition error:', error);

        if (error === 'no-speech') {
          // Normal background silence, continue listening
          return;
        }

        if (error === 'not-allowed' || error === 'service-not-allowed') {
          this.isListening = false;
          this.consecutiveErrors = 0;
          this.events.onError?.('Microphone or speech permission was denied.');
          this.events.onStatusChange?.('error');
          return;
        }

        if (error === 'network') {
          this.consecutiveErrors++;
          if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            this.isListening = false;
            this.events.onError?.(
              'Live speech recognition network service is unavailable in standalone Electron (Google Cloud Speech requires browser context or an external STT service). Microphone capture and volume meter remain active.'
            );
            this.events.onStatusChange?.('error');
            try {
              this.recognition?.abort();
            } catch {}
            return;
          }
          this.events.onError?.('Speech service network issue, attempting reconnection…');
          this.scheduleRestart(lang, 2000);
          return;
        }

        if (error === 'aborted') {
          // Expected on explicit abort/stop
          return;
        }

        this.consecutiveErrors++;
        if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
          this.isListening = false;
          this.events.onError?.(`Speech recognition stopped due to error: ${error}`);
          this.events.onStatusChange?.('error');
          return;
        }
        this.events.onError?.(`Speech recognition error: ${error}`);
      };

      this.recognition.onend = () => {
        // Chromium SpeechRecognition times out after ~60s of silence/stream.
        // Auto-reconnect seamlessly if the user has not stopped listening and no fatal errors occurred.
        if (this.isListening && !this.isPaused && this.consecutiveErrors < this.MAX_CONSECUTIVE_ERRORS) {
          this.scheduleRestart(lang, 1500);
        } else if (!this.isListening) {
          this.events.onStatusChange?.('idle');
        }
      };

      this.recognition.start();
    } catch (err) {
      console.error('[STT] Failed to initialize SpeechRecognition:', err);
      this.isListening = false;
      const msg = err instanceof Error ? err.message : String(err);
      this.events.onError?.(`Failed to start speech recognition: ${msg}`);
      this.events.onStatusChange?.('error');
      throw err;
    }
  }

  private scheduleRestart(lang: string, delayMs = 1500): void {
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    if (!this.isListening || this.isPaused || this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
      return;
    }
    this.restartTimeout = setTimeout(() => {
      if (this.isListening && !this.isPaused && this.consecutiveErrors < this.MAX_CONSECUTIVE_ERRORS) {
        try {
          this.initRecognition(lang);
        } catch {
          // Ignore retry failure
        }
      }
    }, delayMs);
  }

  pause(): void {
    this.isPaused = true;
    this.events.onStatusChange?.('paused');
    try {
      this.recognition?.stop();
    } catch {
      // Ignore
    }
  }

  resume(): void {
    if (!this.isListening) return;
    this.isPaused = false;
    this.events.onStatusChange?.('listening');
    try {
      this.recognition?.start();
    } catch {
      this.initRecognition(this.recognition?.lang || 'en-US');
    }
  }

  async stop(): Promise<void> {
    this.isListening = false;
    this.isPaused = false;
    this.consecutiveErrors = 0;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }

    this.events.onStatusChange?.('idle');
  }
}
