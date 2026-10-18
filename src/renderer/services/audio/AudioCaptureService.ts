import { WebSpeechSttAdapter } from './SttAdapter';
import type {
  AudioDevice,
  AudioSessionStatus,
  TranscriptSegment,
  SttAdapter,
  AudioSourceType,
} from './types';

export class AudioCaptureService {
  private sttAdapter: SttAdapter;
  private currentStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private status: AudioSessionStatus = 'idle';

  // Callbacks
  private onTranscriptCallbacks = new Set<(segment: TranscriptSegment) => void>();
  private onStatusCallbacks = new Set<(status: AudioSessionStatus) => void>();
  private onErrorCallbacks = new Set<(error: string) => void>();
  private onVolumeCallbacks = new Set<(level: number) => void>();

  constructor(adapter?: SttAdapter) {
    this.sttAdapter = adapter || new WebSpeechSttAdapter();

    this.sttAdapter.setEvents({
      onTranscript: (seg) => {
        this.onTranscriptCallbacks.forEach((cb) => cb(seg));
      },
      onError: (err) => {
        this.onErrorCallbacks.forEach((cb) => cb(err));
      },
      onStatusChange: (s) => {
        this.status = s;
        this.onStatusCallbacks.forEach((cb) => cb(s));
      },
    });
  }

  getStatus(): AudioSessionStatus {
    return this.status;
  }

  isSttSupported(): boolean {
    return this.sttAdapter.isSupported();
  }

  async getDevices(): Promise<AudioDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${index + 1}`,
          kind: d.kind,
          isDefault: d.deviceId === 'default',
        }));
    } catch (err) {
      console.warn('[Audio] Could not enumerate devices:', err);
      return [];
    }
  }

  async startListening(options?: {
    deviceId?: string;
    sourceType?: AudioSourceType;
  }): Promise<{ deviceLabel: string }> {
    if (this.status === 'listening') {
      return { deviceLabel: 'Active Microphone' };
    }

    try {
      this.status = 'listening';
      this.onStatusCallbacks.forEach((cb) => cb('listening'));

      // 1. Request microphone or audio stream
      const constraints: MediaStreamConstraints = {
        audio: options?.deviceId ? { deviceId: { exact: options.deviceId } } : true,
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.currentStream = stream;

      const activeTrack = stream.getAudioTracks()[0];
      const deviceLabel = activeTrack?.label || 'Default Microphone';

      // 2. Set up Web Audio API volume level analyzer for visual feedback
      this.initVolumeAnalyzer(stream);

      // 3. Start STT adapter
      await this.sttAdapter.start();

      return { deviceLabel };
    } catch (err) {
      console.error('[Audio] Failed to start audio capture:', err);
      this.cleanupMedia();
      this.status = 'error';
      this.onStatusCallbacks.forEach((cb) => cb('error'));

      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Please allow microphone access in Windows Settings.'
          : err instanceof Error
          ? err.message
          : 'Failed to access audio device.';

      this.onErrorCallbacks.forEach((cb) => cb(msg));
      throw new Error(msg);
    }
  }

  private initVolumeAnalyzer(stream: MediaStream): void {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioContext = new AudioContextClass();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        if (!this.analyser || this.status !== 'listening') {
          this.onVolumeCallbacks.forEach((cb) => cb(0));
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        // Normalize 0 - 100
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        this.onVolumeCallbacks.forEach((cb) => cb(normalized));

        this.animFrameId = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (err) {
      console.warn('[Audio] Could not initialize volume analyzer:', err);
    }
  }

  pauseListening(): void {
    if (this.status !== 'listening') return;
    this.status = 'paused';
    this.sttAdapter.pause();
    this.onVolumeCallbacks.forEach((cb) => cb(0));
    this.onStatusCallbacks.forEach((cb) => cb('paused'));
  }

  resumeListening(): void {
    if (this.status !== 'paused') return;
    this.status = 'listening';
    this.sttAdapter.resume();
    this.onStatusCallbacks.forEach((cb) => cb('listening'));
  }

  async stopListening(): Promise<void> {
    this.status = 'idle';
    this.cleanupMedia();
    await this.sttAdapter.stop();
    this.onVolumeCallbacks.forEach((cb) => cb(0));
    this.onStatusCallbacks.forEach((cb) => cb('idle'));
  }

  private cleanupMedia(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      this.currentStream = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {
        // Ignore
      }
      this.audioContext = null;
    }

    this.analyser = null;
  }

  // Event Subscription Helpers
  onTranscript(cb: (segment: TranscriptSegment) => void): () => void {
    this.onTranscriptCallbacks.add(cb);
    return () => this.onTranscriptCallbacks.delete(cb);
  }

  onStatusChange(cb: (status: AudioSessionStatus) => void): () => void {
    this.onStatusCallbacks.add(cb);
    return () => this.onStatusCallbacks.delete(cb);
  }

  onError(cb: (err: string) => void): () => void {
    this.onErrorCallbacks.add(cb);
    return () => this.onErrorCallbacks.delete(cb);
  }

  onVolumeLevel(cb: (level: number) => void): () => void {
    this.onVolumeCallbacks.add(cb);
    return () => this.onVolumeCallbacks.delete(cb);
  }
}
