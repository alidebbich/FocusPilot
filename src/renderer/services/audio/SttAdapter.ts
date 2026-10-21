import { v4 as uuidv4 } from 'uuid';
import type { SttAdapter, SttAdapterEvents, TranscriptSegment, AudioSessionStatus } from './types';

/**
 * GeminiSttAdapter
 * Robust, production speech-to-text adapter for Electron desktop app.
 * Transcribes audio chunks using Google Generative AI via secure IPC.
 */
export class GeminiSttAdapter implements SttAdapter {
  readonly name = 'Gemini Audio STT';
  private isListening = false;
  private isPaused = false;
  private events: Partial<SttAdapterEvents> = {};
  private activeLanguage = 'en-US';
  private processingQueue: Array<{ buffer: ArrayBuffer | Uint8Array; mimeType: string }> = [];
  private isProcessing = false;

  isSupported(): boolean {
    return typeof window !== 'undefined' && !!(window as any).api?.audio?.transcribe;
  }

  setEvents(events: Partial<SttAdapterEvents>): void {
    this.events = { ...this.events, ...events };
  }

  async start(options?: { language?: string }): Promise<void> {
    if (this.isListening) return;

    this.isListening = true;
    this.isPaused = false;
    this.activeLanguage = options?.language || 'en-US';
    this.processingQueue = [];
    this.isProcessing = false;

    // Verify provider status via IPC
    try {
      if (typeof window !== 'undefined' && (window as any).api?.audio?.checkStatus) {
        const status = await (window as any).api.audio.checkStatus();
        if (!status.geminiConfigured) {
          const warnMsg = 'No Gemini API key configured. Please enter your API key in Settings → AI Provider.';
          this.events.onError?.(warnMsg);
          this.events.onStatusChange?.('error');
          throw new Error(warnMsg);
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes('No Gemini API key')) {
        throw err;
      }
      // Non-fatal check failure (e.g. during unit tests without full electron mock)
    }

    this.events.onStatusChange?.('listening');
  }

  /**
   * Accepts encoded audio buffer (e.g., 16kHz WAV or WebM) and submits for transcription.
   */
  async processAudioBuffer(audioBuffer: ArrayBuffer | Uint8Array, mimeType: string): Promise<void> {
    if (!this.isListening || this.isPaused) return;

    this.processingQueue.push({ buffer: audioBuffer, mimeType });
    this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) return;
    this.isProcessing = true;

    const item = this.processingQueue.shift();
    if (!item) {
      this.isProcessing = false;
      return;
    }

    try {
      // Convert buffer to base64
      const base64 = this.bufferToBase64(item.buffer);
      if (!base64 || base64.length === 0) {
        this.isProcessing = false;
        return;
      }

      // Emit partial listening update
      this.events.onStatusChange?.('processing');

      const response = await (window as any).api.audio.transcribe({
        audioBase64: base64,
        mimeType: item.mimeType,
        language: this.activeLanguage,
      });

      if (response?.text && response.text.trim().length > 0) {
        const segment: TranscriptSegment = {
          id: uuidv4(),
          text: response.text.trim(),
          isFinal: true,
          timestamp: Date.now(),
          confidence: 0.95,
        };
        this.events.onTranscript?.(segment);
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[GeminiSttAdapter] Transcription failed:', msg);

      // Distinguish quota/auth vs network errors
      if (msg.includes('Invalid Gemini API key') || msg.includes('quota') || msg.includes('rate limit')) {
        this.isListening = false;
        this.processingQueue = [];
        this.events.onError?.(msg);
        this.events.onStatusChange?.('error');
      } else {
        this.events.onError?.(msg);
      }
    } finally {
      this.isProcessing = false;
      if (this.isListening && !this.isPaused) {
        this.events.onStatusChange?.('listening');
      }
      // Continue draining any queued chunks
      if (this.processingQueue.length > 0) {
        this.drainQueue();
      }
    }
  }

  private bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
    const uint8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = '';
    const len = uint8.byteLength;
    // Process in 8KB chunks to prevent stack overflow with huge buffers
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      const end = Math.min(i + chunkSize, len);
      binary += String.fromCharCode.apply(null, uint8.subarray(i, end) as any);
    }
    return btoa(binary);
  }

  pause(): void {
    this.isPaused = true;
    this.events.onStatusChange?.('paused');
  }

  resume(): void {
    if (!this.isListening) return;
    this.isPaused = false;
    this.events.onStatusChange?.('listening');
    this.drainQueue();
  }

  async stop(): Promise<void> {
    this.isListening = false;
    this.isPaused = false;
    this.processingQueue = [];
    this.isProcessing = false;
    this.events.onStatusChange?.('idle');
  }
}

/**
 * WebSpeechSttAdapter
 * Fallback browser speech recognition adapter (only works in Chrome browser context with Google Speech keys).
 */
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
      const err = 'Web Speech API is not supported in this runtime environment.';
      this.events.onError?.(err);
      this.events.onStatusChange?.('error');
      throw new Error(err);
    }

    if (this.isListening) return;

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
        if (error === 'no-speech') return;

        if (error === 'not-allowed' || error === 'service-not-allowed') {
          this.isListening = false;
          this.events.onError?.('Microphone or speech permission was denied.');
          this.events.onStatusChange?.('error');
          return;
        }

        if (error === 'network') {
          this.consecutiveErrors++;
          if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            this.isListening = false;
            this.events.onError?.(
              'Web Speech API network service is unavailable in standalone Electron. Switch to Gemini STT adapter.'
            );
            this.events.onStatusChange?.('error');
            try { this.recognition?.abort(); } catch {}
            return;
          }
          this.events.onError?.('Speech service network issue, attempting reconnection…');
          this.scheduleRestart(lang, 2000);
          return;
        }

        if (error === 'aborted') return;

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
        if (this.isListening && !this.isPaused && this.consecutiveErrors < this.MAX_CONSECUTIVE_ERRORS) {
          this.scheduleRestart(lang, 1500);
        } else if (!this.isListening) {
          this.events.onStatusChange?.('idle');
        }
      };

      this.recognition.start();
    } catch (err) {
      this.isListening = false;
      const msg = err instanceof Error ? err.message : String(err);
      this.events.onError?.(`Failed to start speech recognition: ${msg}`);
      this.events.onStatusChange?.('error');
      throw err;
    }
  }

  private scheduleRestart(lang: string, delayMs = 1500): void {
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    if (!this.isListening || this.isPaused || this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) return;

    this.restartTimeout = setTimeout(() => {
      if (this.isListening && !this.isPaused && this.consecutiveErrors < this.MAX_CONSECUTIVE_ERRORS) {
        try { this.initRecognition(lang); } catch {}
      }
    }, delayMs);
  }

  pause(): void {
    this.isPaused = true;
    this.events.onStatusChange?.('paused');
    try { this.recognition?.stop(); } catch {}
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
      try { this.recognition.abort(); } catch {}
      this.recognition = null;
    }
    this.events.onStatusChange?.('idle');
  }
}
