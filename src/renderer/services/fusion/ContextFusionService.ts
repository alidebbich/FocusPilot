import type {
  ImageContext,
  AudioTranscriptContext,
  TranscriptSegment,
  AiSendMessagePayload,
  ChatMessage,
  ProviderName,
} from '../../../shared/types';

export interface FusionQueryOptions {
  conversationId: string;
  question: string;
  imageContext?: ImageContext | null;
  transcriptSegments?: TranscriptSegment[];
  previousMessages?: ChatMessage[];
  provider?: ProviderName;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class ContextFusionService {
  private activeAbortController: AbortController | null = null;
  private maxTranscriptHistorySeconds = 60; // Keep last 60 seconds of spoken context
  private maxTranscriptSegments = 10;

  cancelActiveRequest(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    window.api.ai.cancel();
  }

  prepareFusedPayload(opts: FusionQueryOptions): AiSendMessagePayload {
    const now = Date.now();

    // 1. Filter recent transcript segments within the rolling window
    let audioContext: AudioTranscriptContext | undefined;
    if (opts.transcriptSegments && opts.transcriptSegments.length > 0) {
      const recentSegments = opts.transcriptSegments
        .filter((s) => s.isFinal && now - s.timestamp <= this.maxTranscriptHistorySeconds * 1000)
        .slice(-this.maxTranscriptSegments);

      if (recentSegments.length > 0) {
        const fullText = recentSegments.map((s) => s.text).join(' ');
        audioContext = {
          segments: recentSegments.map((s) => ({
            text: s.text,
            timestamp: s.timestamp,
            isQuestion: s.isQuestion,
          })),
          recentFullText: fullText,
          detectedQuestion: opts.question,
        };
      }
    }

    // 2. Structured prompt instructing concise suggested answer + deep dive
    const systemInstruction =
      'You are FocusPilot, a context-aware Windows desktop assistant.\n' +
      'Structure your response cleanly:\n' +
      '1. **Suggested Answer**: Provide a clear, direct, and concise answer (1-3 sentences or bullet points). If code is needed, give the exact fix directly.\n' +
      '2. **Context & Reasoning**: Briefly reference the visible screen code/UI or spoken question supporting your answer.\n' +
      'Keep your tone professional, sharp, and helpful.';

    // 3. User message
    const userMessage: ChatMessage = {
      id: `q-${now}`,
      role: 'user',
      content: opts.question,
      timestamp: now,
    };

    const messages = [...(opts.previousMessages || []), userMessage];

    return {
      conversationId: opts.conversationId,
      messages,
      systemInstruction,
      provider: opts.provider || 'gemini',
      model: opts.model || 'gemini-2.5-flash',
      temperature: opts.temperature ?? 0.6,
      maxTokens: opts.maxTokens ?? 2048,
      imageContext: opts.imageContext || undefined,
      audioContext,
    };
  }
}
