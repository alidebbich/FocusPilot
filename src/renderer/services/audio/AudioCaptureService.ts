import { GeminiSttAdapter } from './SttAdapter';
import type {
  AudioDevice,
  AudioSessionStatus,
  TranscriptSegment,
  SttAdapter,
  AudioSourceType,
} from './types';

/**
 * Encodes raw 32-bit float PCM audio samples into a standard 16-bit mono WAV buffer.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // PCM data conversion from [-1.0, 1.0] float to 16-bit signed integer
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export class AudioCaptureService {
  private sttAdapter: SttAdapter;
  private currentStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private animFrameId: number | null = null;
  private status: AudioSessionStatus = 'idle';

  // Audio buffering & VAD
  private audioBufferChunks: Float32Array[] = [];
  private totalBufferedSamples = 0;
  private isSpeaking = false;
  private silenceSampleCount = 0;
  private readonly TARGET_SAMPLE_RATE = 16000;
  private readonly SILENCE_ENERGY_THRESHOLD = 0.015;
  private readonly MAX_RECORD_SECONDS = 5.0; // Max chunk duration before forced dispatch
  private readonly MIN_SPEECH_SECONDS = 0.5; // Ignore clicks/blips shorter than 500ms
  private readonly SILENCE_CUTOFF_SECONDS = 0.7; // 700ms pause indicates end of spoken phrase

  // Callbacks
  private onTranscriptCallbacks = new Set<(segment: TranscriptSegment) => void>();
  private onStatusCallbacks = new Set<(status: AudioSessionStatus) => void>();
  private onErrorCallbacks = new Set<(error: string) => void>();
  private onVolumeCallbacks = new Set<(level: number) => void>();

  constructor(adapter?: SttAdapter) {
    this.sttAdapter = adapter || new GeminiSttAdapter();

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

    // Cleanup on window unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.stopListening().catch(() => {});
      });
    }
  }

  getStatus(): AudioSessionStatus {
    return this.status;
  }

  isSttSupported(): boolean {
    return this.sttAdapter.isSupported();
  }

  getSttAdapter(): SttAdapter {
    return this.sttAdapter;
  }

  async getDevices(): Promise<AudioDevice[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, index) => {
          const isLoopback =
            /stereo mix|what u hear|wave out|loopback|cable output/i.test(d.label);
          return {
            deviceId: d.deviceId,
            label: d.label
              ? `${d.label}${isLoopback ? ' (System Loopback)' : ''}`
              : `Audio Input ${index + 1}`,
            kind: d.kind,
            isDefault: d.deviceId === 'default',
          };
        });
    } catch (err) {
      console.warn('[Audio] Could not enumerate devices:', err);
      return [];
    }
  }

  async startListening(options?: {
    deviceId?: string;
    sourceType?: AudioSourceType;
    language?: string;
  }): Promise<{ deviceLabel: string }> {
    if (this.status === 'listening' && this.currentStream) {
      const track = this.currentStream.getAudioTracks()[0];
      return { deviceLabel: track?.label || 'Active Audio Device' };
    }

    try {
      this.status = 'listening';
      this.onStatusCallbacks.forEach((cb) => cb('listening'));

      // 1. Build and validate constraints
      let constraints: MediaStreamConstraints;
      if (options?.sourceType === 'system-audio') {
        // System audio loopback
        constraints = {
          audio: {
            deviceId: options?.deviceId ? { exact: options.deviceId } : undefined,
            sampleRate: this.TARGET_SAMPLE_RATE,
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        };
      } else {
        // Microphone capture
        constraints = {
          audio: {
            deviceId: options?.deviceId ? { exact: options.deviceId } : undefined,
            sampleRate: this.TARGET_SAMPLE_RATE,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        };
      }

      // 2. Request user media with error classification
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        if (err?.name === 'OverconstrainedError' && options?.deviceId) {
          // Fallback to default device if specified ID is invalid or unplugged
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } else {
          throw err;
        }
      }

      this.currentStream = stream;
      const activeTrack = stream.getAudioTracks()[0];

      if (!activeTrack) {
        throw new Error('No active audio track available from device.');
      }

      // Listen for track ending (e.g. headset unplugged)
      activeTrack.onended = () => {
        this.stopListening().catch(() => {});
        this.onErrorCallbacks.forEach((cb) =>
          cb('Audio input device was disconnected or stopped by system.')
        );
      };

      const deviceLabel = activeTrack.label || 'Default Microphone';

      // 3. Setup AudioContext and Audio Processor
      this.initAudioPipeline(stream);

      // 4. Start the STT adapter
      await this.sttAdapter.start({ language: options?.language });

      return { deviceLabel };
    } catch (err: any) {
      console.error('[Audio] Failed to start audio capture:', err);
      this.cleanupMedia();
      this.status = 'error';
      this.onStatusCallbacks.forEach((cb) => cb('error'));

      let msg = 'Failed to access audio device.';
      const errName = err?.name || '';
      const errMsg = err?.message || String(err);

      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        msg = 'Microphone permission was denied. Please allow microphone access in Windows Settings > Privacy & security > Microphone.';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        msg = 'No microphone or audio input device found. Please plug in a microphone.';
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        msg = 'Audio device is currently busy or exclusive to another application.';
      } else if (errMsg) {
        msg = errMsg;
      }

      this.onErrorCallbacks.forEach((cb) => cb(msg));
      throw new Error(msg);
    }
  }

  private initAudioPipeline(stream: MediaStream): void {
    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioContext = new AudioContextClass();
      const actualSampleRate = this.audioContext.sampleRate;

      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;
      this.sourceNode.connect(this.analyser);

      // Create ScriptProcessor for capturing real audio samples
      // Buffer size 4096 = ~85ms per block at 48kHz
      const bufferSize = 4096;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.audioBufferChunks = [];
      this.totalBufferedSamples = 0;
      this.isSpeaking = false;
      this.silenceSampleCount = 0;

      this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
        if (this.status !== 'listening') return;

        const inputChannel = e.inputBuffer.getChannelData(0);

        // Calculate Root Mean Square (RMS) energy
        let sumSquares = 0;
        for (let i = 0; i < inputChannel.length; i++) {
          sumSquares += inputChannel[i] * inputChannel[i];
        }
        const rms = Math.sqrt(sumSquares / inputChannel.length);

        // Resample or copy to target 16kHz
        const downsampled = this.resampleAudio(inputChannel, actualSampleRate, this.TARGET_SAMPLE_RATE);

        if (rms > this.SILENCE_ENERGY_THRESHOLD) {
          // Voice activity detected
          this.isSpeaking = true;
          this.silenceSampleCount = 0;
          this.audioBufferChunks.push(downsampled);
          this.totalBufferedSamples += downsampled.length;

          // Check if speech duration exceeded max recording chunk (e.g. 5 seconds)
          const currentDuration = this.totalBufferedSamples / this.TARGET_SAMPLE_RATE;
          if (currentDuration >= this.MAX_RECORD_SECONDS) {
            this.dispatchSpeechBuffer();
          }
        } else if (this.isSpeaking) {
          // Currently in speech, but quiet pause
          this.audioBufferChunks.push(downsampled);
          this.totalBufferedSamples += downsampled.length;
          this.silenceSampleCount += downsampled.length;

          const silenceDuration = this.silenceSampleCount / this.TARGET_SAMPLE_RATE;
          if (silenceDuration >= this.SILENCE_CUTOFF_SECONDS) {
            // User paused speaking for > 700ms: dispatch the phrase!
            this.dispatchSpeechBuffer();
          }
        }
      };

      this.sourceNode.connect(this.processorNode);
      // Connect to destination to keep audio processing pipeline active in Chrome/Electron
      this.processorNode.connect(this.audioContext.destination);

      // Start volume meter loop
      this.startVolumeMeter();
    } catch (err) {
      console.warn('[Audio] Could not initialize audio processing pipeline:', err);
    }
  }

  private startVolumeMeter(): void {
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const update = () => {
      if (!this.analyser || this.status !== 'listening') {
        this.onVolumeCallbacks.forEach((cb) => cb(0));
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avg = sum / bufferLength;
      const normalized = Math.min(100, Math.round((avg / 128) * 100));
      this.onVolumeCallbacks.forEach((cb) => cb(normalized));

      this.animFrameId = requestAnimationFrame(update);
    };

    update();
  }

  private dispatchSpeechBuffer(): void {
    if (this.totalBufferedSamples === 0) return;

    const totalSamples = this.totalBufferedSamples;
    const duration = totalSamples / this.TARGET_SAMPLE_RATE;

    // Discard ultra-short noises (< 500ms)
    if (duration >= this.MIN_SPEECH_SECONDS) {
      // Merge all chunks into a single Float32Array
      const merged = new Float32Array(totalSamples);
      let offset = 0;
      for (const chunk of this.audioBufferChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      // Encode into clean 16-bit PCM WAV
      const wavBytes = encodeWav(merged, this.TARGET_SAMPLE_RATE);

      // Forward to STT Adapter
      if (this.sttAdapter.processAudioBuffer) {
        this.sttAdapter.processAudioBuffer(wavBytes, 'audio/wav').catch((err) => {
          console.warn('[AudioCaptureService] STT process error:', err);
        });
      }
    }

    // Reset buffer state
    this.audioBufferChunks = [];
    this.totalBufferedSamples = 0;
    this.isSpeaking = false;
    this.silenceSampleCount = 0;
  }

  /**
   * Resamples PCM Float32 audio from input sample rate to target rate (linear interpolation).
   */
  private resampleAudio(
    samples: Float32Array,
    inputRate: number,
    targetRate: number
  ): Float32Array {
    if (inputRate === targetRate) {
      return new Float32Array(samples);
    }
    const ratio = inputRate / targetRate;
    const newLength = Math.round(samples.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const originalIndex = i * ratio;
      const leftIndex = Math.floor(originalIndex);
      const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
      const frac = originalIndex - leftIndex;
      result[i] = samples[leftIndex] * (1 - frac) + samples[rightIndex] * frac;
    }
    return result;
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
    this.startVolumeMeter();
    this.onStatusCallbacks.forEach((cb) => cb('listening'));
  }

  async stopListening(): Promise<void> {
    this.status = 'idle';
    // Flush any pending speech before closing
    if (this.isSpeaking) {
      this.dispatchSpeechBuffer();
    }
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

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.currentStream = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close().catch(() => {});
        }
      } catch {}
      this.audioContext = null;
    }

    this.analyser = null;
    this.audioBufferChunks = [];
    this.totalBufferedSamples = 0;
    this.isSpeaking = false;
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
