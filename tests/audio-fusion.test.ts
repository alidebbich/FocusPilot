import { describe, it, expect, vi } from 'vitest';
import { QuestionDetector } from '../src/renderer/services/audio/QuestionDetector';
import { ContextFusionService } from '../src/renderer/services/fusion/ContextFusionService';
import type { TranscriptSegment, ImageContext } from '../src/shared/types';

describe('QuestionDetector', () => {
  it('detects sentences ending with question mark', async () => {
    const detector = new QuestionDetector();
    let detectedQuestion: any = null;

    detector.onQuestion((q) => {
      detectedQuestion = q;
    });

    const segment: TranscriptSegment = {
      id: '1',
      text: 'Why does this component re-render on every state update?',
      isFinal: true,
      timestamp: Date.now(),
    };

    detector.processSegment(segment);

    // Wait for the final segment debounce (300ms)
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(detectedQuestion).not.toBeNull();
    expect(detectedQuestion.text).toBe(segment.text);
    expect(detectedQuestion.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('detects interrogative questions without a question mark', async () => {
    const detector = new QuestionDetector();
    let detectedQuestion: any = null;

    detector.onQuestion((q) => {
      detectedQuestion = q;
    });

    const segment: TranscriptSegment = {
      id: '2',
      text: 'Can you explain the difference between useMemo and useCallback',
      isFinal: true,
      timestamp: Date.now(),
    };

    detector.processSegment(segment);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(detectedQuestion).not.toBeNull();
    expect(detectedQuestion.text).toBe(segment.text);
  });

  it('does not trigger on declarative statements', async () => {
    const detector = new QuestionDetector();
    let triggered = false;

    detector.onQuestion(() => {
      triggered = true;
    });

    const segment: TranscriptSegment = {
      id: '3',
      text: 'We are deploying the service to production this afternoon.',
      isFinal: true,
      timestamp: Date.now(),
    };

    detector.processSegment(segment);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(triggered).toBe(false);
  });
});

describe('ContextFusionService', () => {
  const fusion = new ContextFusionService();

  const mockImageContext: ImageContext = {
    base64: 'mockBase64Data',
    dataUrl: 'data:image/jpeg;base64,mockBase64Data',
    mimeType: 'image/jpeg',
    width: 1280,
    height: 720,
    timestamp: Date.now(),
    sourceName: 'Visual Studio Code',
  };

  const mockTranscripts = [
    { id: 't1', text: 'Let us check the authentication controller.', isFinal: true, timestamp: Date.now() - 10000 },
    { id: 't2', text: 'Why is line 42 returning a null pointer error?', isFinal: true, timestamp: Date.now() - 2000 },
  ];

  it('fuses both screen and audio transcript into payload', () => {
    const payload = fusion.prepareFusedPayload({
      conversationId: 'conv-123',
      question: 'Why is line 42 returning a null pointer error?',
      imageContext: mockImageContext,
      transcriptSegments: mockTranscripts as any,
    });

    expect(payload.conversationId).toBe('conv-123');
    expect(payload.imageContext).toBeDefined();
    expect(payload.imageContext?.sourceName).toBe('Visual Studio Code');
    expect(payload.audioContext).toBeDefined();
    expect(payload.audioContext?.recentFullText).toContain('authentication controller');
    expect(payload.audioContext?.recentFullText).toContain('line 42');
    expect(payload.systemInstruction).toContain('FocusPilot');
  });

  it('works in screen-only mode when audio is absent', () => {
    const payload = fusion.prepareFusedPayload({
      conversationId: 'conv-456',
      question: 'Explain the visible code',
      imageContext: mockImageContext,
      transcriptSegments: [],
    });

    expect(payload.imageContext).toBeDefined();
    expect(payload.audioContext).toBeUndefined();
    expect(payload.messages[0].content).toBe('Explain the visible code');
  });

  it('works in audio-only mode when screen context is absent', () => {
    const payload = fusion.prepareFusedPayload({
      conversationId: 'conv-789',
      question: 'Summarize the discussion',
      imageContext: null,
      transcriptSegments: mockTranscripts as any,
    });

    expect(payload.imageContext).toBeUndefined();
    expect(payload.audioContext).toBeDefined();
    expect(payload.audioContext?.recentFullText).toContain('line 42');
  });
});
