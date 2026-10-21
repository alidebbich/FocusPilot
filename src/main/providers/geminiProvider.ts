import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/generative-ai';
import type { ChatMessage, ImageContext, AudioTranscriptContext } from '../../shared/types';

interface StreamOptions {
  messages: ChatMessage[];
  systemInstruction?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  imageContext?: ImageContext;
  audioContext?: AudioTranscriptContext;
}

const VALID_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
]);

function normalizeModel(model?: string): string {
  if (!model) return 'gemini-2.5-flash';
  // Map legacy/deprecated model names to current equivalents
  if (model.startsWith('gemini-1.5') || model === 'gemini-2.0-flash' || model === 'gemini-2.0-flash-lite') {
    return 'gemini-2.5-flash';
  }
  // If the model ID is not in our known-valid set, fall back safely
  if (!VALID_MODELS.has(model)) {
    console.warn(`[GeminiProvider] Unknown model "${model}", falling back to gemini-2.5-flash`);
    return 'gemini-2.5-flash';
  }
  return model;
}

export class GeminiProvider {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async *streamMessage(opts: StreamOptions): AsyncGenerator<string> {
    const primaryModel = normalizeModel(opts.model);
    const candidateModels = [primaryModel];
    if (primaryModel === 'gemini-2.5-flash') {
      candidateModels.push('gemini-2.5-flash-lite');
    }

    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        let systemPrompt = opts.systemInstruction;
        if (!systemPrompt) {
          if (opts.imageContext && opts.audioContext?.recentFullText) {
            systemPrompt =
              'You are FocusPilot, a context-aware Windows desktop assistant combining real-time screen analysis and meeting speech context. ' +
              'Answer questions directly and concisely using both visible screen elements (code, UI, documents, errors) and recent conversation speech. ' +
              'Provide a short, useful direct answer first (1-3 sentences or key points), followed by brief context explanation if relevant.';
          } else if (opts.imageContext) {
            systemPrompt =
              'You are FocusPilot, a context-aware Windows desktop assistant. The user has shared their authorized screen capture with you. ' +
              'Answer their questions accurately and concisely based on what is visible on screen, whether it is code, UI, error messages, or documents.';
          } else if (opts.audioContext?.recentFullText) {
            systemPrompt =
              'You are FocusPilot, an audio meeting and conversation assistant. ' +
              'Answer questions accurately and concisely based on the recent speech transcript context provided.';
          }
        }

        const model = this.client.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature: opts.temperature ?? 0.7,
            maxOutputTokens: opts.maxTokens ?? 4096,
          },
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          ],
        });

        // Convert previous messages to Gemini history format
        const history = opts.messages.slice(0, -1).map((msg) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        }));

        const lastMessage = opts.messages[opts.messages.length - 1];
        if (!lastMessage) throw new Error('No messages to send');

        const chat = model.startChat({ history });

        let userPromptText = lastMessage.content;
        if (opts.audioContext?.recentFullText && !userPromptText.includes('[RECENT LIVE SPEECH TRANSCRIPT]')) {
          userPromptText =
            `[RECENT LIVE SPEECH TRANSCRIPT]:\n"${opts.audioContext.recentFullText}"\n\n` +
            `[QUESTION / REQUEST]:\n${lastMessage.content}`;
        }

        let messagePayload: string | Array<string | { inlineData: { data: string; mimeType: string } }>;
        if (opts.imageContext?.base64) {
          messagePayload = [
            {
              inlineData: {
                data: opts.imageContext.base64,
                mimeType: opts.imageContext.mimeType || 'image/jpeg',
              },
            },
            userPromptText,
          ];
        } else {
          messagePayload = userPromptText;
        }

        const result = await chat.sendMessageStream(messagePayload as any);

        for await (const chunk of result.stream) {
          if (opts.signal?.aborted) break;
          const text = chunk.text();
          if (text) yield text;
        }

        // Successfully completed stream
        return;
      } catch (err: any) {
        lastError = err;
        const status = err?.status || err?.statusCode;
        const msg = String(err?.message || '');
        // If 429 quota or 404, try next candidate model
        if ((status === 429 || msg.includes('429') || status === 404) && modelName !== candidateModels[candidateModels.length - 1]) {
          console.warn(`[GeminiProvider] Model ${modelName} encountered ${status || 'error'}, falling back to next candidate...`);
          continue;
        }
        throw err;
      }
    }

    if (lastError) throw lastError;
  }

  async testConnection(model: string): Promise<void> {
    const modelName = normalizeModel(model);
    const m = this.client.getGenerativeModel({ model: modelName });
    const result = await m.generateContent('Reply with the single word: OK');
    const text = result.response.text();
    if (!text) throw new Error('Empty response from Gemini API');
  }

  static getSupportedModels(): string[] {
    return [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
    ];
  }
}
