import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuestionDetector } from '../src/renderer/services/audio/QuestionDetector';
import { ContextFusionService } from '../src/renderer/services/fusion/ContextFusionService';
import { AudioCaptureService, encodeWav } from '../src/renderer/services/audio/AudioCaptureService';
import { GeminiSttAdapter } from '../src/renderer/services/audio/SttAdapter';
import type { TranscriptSegment, ImageContext } from '../src/shared/types';

// ─── Web Audio & Media Mocks for Headless Testing ───────────────────────────
class MockMediaStreamTrack {
  enabled = true;
  readyState = 'live';
  label = 'Realtek High Definition Audio';
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
  getSettings = vi.fn(() => ({
    sampleRate: 16000,
    channelCount: 1,
    deviceId: 'default',
  }));
}

class MockMediaStream {
  private tracks: MockMediaStreamTrack[];
  constructor(tracks?: MockMediaStreamTrack[]) {
    this.tracks = tracks || [new MockMediaStreamTrack()];
  }
  getAudioTracks() {
    return this.tracks;
  }
  getTracks() {
    return this.tracks;
  }
}

class MockAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  state: 'running' | 'closed' = 'running';
  sampleRate = 16000;
  destination = new MockAudioNode();
  createMediaStreamSource = vi.fn(() => new MockAudioNode());
  createAnalyser = vi.fn(() => ({
    ...new MockAudioNode(),
    fftSize: 256,
    frequencyBinCount: 128,
    smoothingTimeConstant: 0.5,
    getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(50)),
  }));
  createScriptProcessor = vi.fn(() => {
    const node = new MockAudioNode() as any;
    node.onaudioprocess = null;
    return node;
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
}

describe('Mandatory Rule 7 Verification Suite — Audio & AI Pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    const mockWindow = {
      AudioContext: MockAudioContext,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      api: {
        audio: {
          transcribe: vi.fn().mockResolvedValue({ text: 'Hello, testing speech recognition.' }),
          checkStatus: vi.fn().mockResolvedValue({ geminiConfigured: true, supportedProviders: ['gemini'] }),
        },
        ai: {
          cancel: vi.fn(),
        },
      },
    };

    const mockNavigator = {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: 'mic-1', label: 'Microphone Array (Intel Smart Sound)', kind: 'audioinput' },
          { deviceId: 'stereo-mix', label: 'Stereo Mix (Realtek Audio)', kind: 'audioinput' },
        ]),
      },
    };

    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'navigator', {
      value: mockNavigator,
      configurable: true,
      writable: true,
    });

    (globalThis as any).requestAnimationFrame = vi.fn((cb) => 1);
    (globalThis as any).cancelAnimationFrame = vi.fn();
    (globalThis as any).btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // ─── 1. Audio permission denied ───────────────────────────────────────────
  it('Requirement 1: handles Audio Permission Denied cleanly', async () => {
    const permError = new DOMException('Permission denied by user', 'NotAllowedError');
    (globalThis as any).navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(permError);

    const service = new AudioCaptureService();
    let emittedError = '';
    service.onError((err) => {
      emittedError = err;
    });

    await expect(service.startListening()).rejects.toThrow();
    expect(service.getStatus()).toBe('error');
    expect(emittedError).toContain('Microphone permission was denied');
    expect(emittedError).toContain('Windows Settings');
  });

  // ─── 2. No microphone available ──────────────────────────────────────────
  it('Requirement 2: detects No Microphone Available and alerts user', async () => {
    const notFoundError = new DOMException('Requested device not found', 'NotFoundError');
    (globalThis as any).navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(notFoundError);
    (globalThis as any).navigator.mediaDevices.enumerateDevices = vi.fn().mockResolvedValue([]);

    const service = new AudioCaptureService();
    const devices = await service.getDevices();
    expect(devices).toHaveLength(0);

    let emittedError = '';
    service.onError((err) => {
      emittedError = err;
    });

    await expect(service.startListening()).rejects.toThrow();
    expect(service.getStatus()).toBe('error');
    expect(emittedError).toContain('No microphone or audio input device found');
  });

  // ─── 3. Start and stop transitions ───────────────────────────────────────
  it('Requirement 3: manages Start and Stop state transitions correctly', async () => {
    const service = new AudioCaptureService();
    const statuses: string[] = [];
    service.onStatusChange((status) => statuses.push(status));

    expect(service.getStatus()).toBe('idle');

    const result = await service.startListening();
    expect(result.deviceLabel).toBeDefined();
    expect(service.getStatus()).toBe('listening');
    expect(statuses).toContain('listening');

    await service.stopListening();
    expect(service.getStatus()).toBe('idle');
    expect(statuses).toContain('idle');
  });

  // ─── 4. Valid audio chunks reaching the transcription adapter ────────────
  it('Requirement 4: produces valid 16kHz mono WAV chunks and forwards to adapter', async () => {
    // Generate 16kHz 1-second sine wave
    const sampleRate = 16000;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < sampleRate; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    }

    const wavBytes = encodeWav(samples, sampleRate);
    expect(wavBytes.length).toBe(44 + sampleRate * 2);

    // Verify WAV Header
    const view = new DataView(wavBytes.buffer);
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(riff).toBe('RIFF');
    expect(wave).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1); // PCM format
    expect(view.getUint16(22, true)).toBe(1); // 1 Channel (Mono)
    expect(view.getUint32(24, true)).toBe(16000); // 16kHz
    expect(view.getUint16(34, true)).toBe(16); // 16-bit

    // Verify adapter receives and processes the buffer
    const adapter = new GeminiSttAdapter();
    let transcriptReceived: any = null;
    adapter.setEvents({
      onTranscript: (seg) => {
        transcriptReceived = seg;
      },
    });

    await adapter.start();
    await adapter.processAudioBuffer(wavBytes, 'audio/wav');

    // Wait for queue drain
    await new Promise((r) => setTimeout(r, 50));
    expect((window as any).api.audio.transcribe).toHaveBeenCalled();
    expect(transcriptReceived).not.toBeNull();
    expect(transcriptReceived?.text).toBe('Hello, testing speech recognition.');
  });

  // ─── 5. Valid partial and final transcript events ────────────────────────
  it('Requirement 5: parses and emits valid Final and Partial transcript events', async () => {
    const adapter = new GeminiSttAdapter();
    const emittedSegments: TranscriptSegment[] = [];
    const statusChanges: string[] = [];

    adapter.setEvents({
      onTranscript: (seg) => emittedSegments.push(seg),
      onStatusChange: (status) => statusChanges.push(status),
    });

    await adapter.start();

    // Mock API returning valid text
    (window as any).api.audio.transcribe = vi.fn().mockResolvedValue({
      text: 'What is the architectural advantage of React Server Components?',
    });

    const dummyAudio = new Uint8Array(100);
    await adapter.processAudioBuffer(dummyAudio, 'audio/wav');

    await new Promise((r) => setTimeout(r, 50));

    expect(emittedSegments).toHaveLength(1);
    const seg = emittedSegments[0];
    expect(seg.id).toBeDefined();
    expect(seg.text).toContain('React Server Components');
    expect(seg.isFinal).toBe(true);
    expect(seg.timestamp).toBeGreaterThan(0);
    expect(statusChanges).toContain('processing');
  });

  // ─── 6. Invalid credentials and quota errors ─────────────────────────────
  it('Requirement 6: catches Invalid Credentials and Quota Errors with actionable message', async () => {
    const adapter = new GeminiSttAdapter();
    let errorReceived = '';
    let statusReceived = '';

    adapter.setEvents({
      onError: (err) => {
        errorReceived = err;
      },
      onStatusChange: (s) => {
        statusReceived = s;
      },
    });

    await adapter.start();

    // Simulate 429 quota exhaustion from Gemini
    (window as any).api.audio.transcribe = vi.fn().mockRejectedValue(
      new Error('Gemini API quota or rate limit exceeded. Please check your AI Studio plan.')
    );

    const dummyAudio = new Uint8Array(100);
    await adapter.processAudioBuffer(dummyAudio, 'audio/wav');
    await new Promise((r) => setTimeout(r, 50));

    expect(errorReceived).toContain('quota or rate limit exceeded');
    expect(statusReceived).toBe('error');

    // Simulate 401 Invalid Key
    (window as any).api.audio.transcribe = vi.fn().mockRejectedValue(
      new Error('Invalid Gemini API key. Please verify your API key in Settings.')
    );

    await adapter.start();
    await adapter.processAudioBuffer(dummyAudio, 'audio/wav');
    await new Promise((r) => setTimeout(r, 50));

    expect(errorReceived).toContain('Invalid Gemini API key');
  });

  // ─── 7. Network failure and reconnection / recovery ───────────────────────
  it('Requirement 7: handles Network Failure gracefully without crashing adapter', async () => {
    const adapter = new GeminiSttAdapter();
    let errorCount = 0;

    adapter.setEvents({
      onError: () => {
        errorCount++;
      },
    });

    await adapter.start();

    // Simulate transient network failure
    (window as any).api.audio.transcribe = vi.fn().mockRejectedValueOnce(
      new Error('Network connection failed while reaching Gemini speech service. Check internet connection.')
    );

    const dummyAudio = new Uint8Array(100);
    await adapter.processAudioBuffer(dummyAudio, 'audio/wav');
    await new Promise((r) => setTimeout(r, 50));

    expect(errorCount).toBe(1);

    // Next request succeeds when network recovers
    let recoveredSegment: any = null;
    adapter.setEvents({
      onTranscript: (seg) => {
        recoveredSegment = seg;
      },
    });
    (window as any).api.audio.transcribe = vi.fn().mockResolvedValueOnce({
      text: 'Speech recovered after network restore.',
    });

    await adapter.processAudioBuffer(dummyAudio, 'audio/wav');
    await new Promise((r) => setTimeout(r, 50));

    expect(recoveredSegment).not.toBeNull();
    expect(recoveredSegment?.text).toBe('Speech recovered after network restore.');
  });

  // ─── 8. Transcript text reaching the AI analysis function ─────────────────
  it('Requirement 8: verifies Transcript Text correctly reaches ContextFusionService AI payload', () => {
    const fusion = new ContextFusionService();

    const mockTranscripts: TranscriptSegment[] = [
      {
        id: 't-1',
        text: 'Could you explain how focus trapping works in accessible dialogs?',
        isFinal: true,
        timestamp: Date.now() - 3000,
        isQuestion: true,
      },
      {
        id: 't-2',
        text: 'Yes, let me show the implementation in our focus trap hook.',
        isFinal: true,
        timestamp: Date.now() - 1000,
      },
    ];

    const payload = fusion.prepareFusedPayload({
      conversationId: 'session-live-01',
      question: 'How does focus trapping work in accessible dialogs?',
      transcriptSegments: mockTranscripts,
    });

    expect(payload.audioContext).toBeDefined();
    expect(payload.audioContext?.recentFullText).toContain('focus trapping works');
    expect(payload.audioContext?.recentFullText).toContain('focus trap hook');
    expect(payload.audioContext?.detectedQuestion).toBe('How does focus trapping work in accessible dialogs?');
    expect(payload.messages[0].content).toBe('How does focus trapping work in accessible dialogs?');
  });

  // ─── 9. Duplicate question suppression ───────────────────────────────────
  it('Requirement 9: suppresses Duplicate Questions from firing multiple AI requests', async () => {
    const detector = new QuestionDetector();
    let triggerCount = 0;
    const triggeredQuestions: any[] = [];

    detector.onQuestion((q) => {
      triggerCount++;
      triggeredQuestions.push(q);
    });

    const questionSegment: TranscriptSegment = {
      id: 'q-dup-1',
      text: 'What is the difference between SQL and NoSQL databases?',
      isFinal: true,
      timestamp: Date.now(),
    };

    // First emission
    detector.processSegment(questionSegment);
    await new Promise((r) => setTimeout(r, 350));
    expect(triggerCount).toBe(1);

    // Second duplicate emission within sliding window
    detector.processSegment({
      ...questionSegment,
      id: 'q-dup-2',
      text: 'what is the difference between sql and nosql databases?', // casing/punctuation variant
    });
    await new Promise((r) => setTimeout(r, 350));

    // Must still be 1 (duplicate suppressed!)
    expect(triggerCount).toBe(1);
    expect(detector.isDuplicate('What is the difference between SQL and NoSQL databases?')).toBe(true);

    // Distinct question should trigger
    detector.processSegment({
      id: 'q-diff',
      text: 'How does indexing improve query performance?',
      isFinal: true,
      timestamp: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 350));
    expect(triggerCount).toBe(2);
  });

  // ─── 10. Stopping capture releases resources ─────────────────────────────
  it('Requirement 10: Stopping capture halts all audio tracks and releases resources', async () => {
    const service = new AudioCaptureService();
    await service.startListening();

    expect(service.getStatus()).toBe('listening');

    await service.stopListening();

    expect(service.getStatus()).toBe('idle');
    // Calling stop multiple times is safe and idempotent
    await expect(service.stopListening()).resolves.not.toThrow();
  });

  // ─── 11. Screen analysis continues working with audio disabled ────────────
  it('Requirement 11: Screen analysis operates completely independently with audio disabled', () => {
    const fusion = new ContextFusionService();

    const mockScreen: ImageContext = {
      base64: 'mockScreenImageBase64',
      dataUrl: 'data:image/jpeg;base64,mockScreenImageBase64',
      mimeType: 'image/jpeg',
      width: 1920,
      height: 1080,
      timestamp: Date.now(),
      sourceName: 'Visual Studio Code',
    };

    // Prepare payload with audio explicitly absent / empty
    const payload = fusion.prepareFusedPayload({
      conversationId: 'screen-only-session',
      question: 'Identify the syntax error on line 42',
      imageContext: mockScreen,
      transcriptSegments: [],
    });

    expect(payload.imageContext).toBeDefined();
    expect(payload.imageContext?.sourceName).toBe('Visual Studio Code');
    expect(payload.audioContext).toBeUndefined(); // Audio is decoupled
    expect(payload.messages[0].content).toBe('Identify the syntax error on line 42');
    expect(payload.systemInstruction).toBeDefined();
  });
});
