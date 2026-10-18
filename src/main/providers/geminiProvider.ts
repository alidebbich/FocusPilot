import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/generative-ai';
import type { ChatMessage } from '../../shared/types';

interface StreamOptions {
  messages: ChatMessage[];
  systemInstruction?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

function normalizeModel(model?: string): string {
  if (!model || model.startsWith('gemini-1.5') || model === 'gemini-2.0-flash' || model === 'gemini-2.0-flash-lite') {
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
    const modelName = normalizeModel(opts.model);
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: opts.systemInstruction || undefined,
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

    // Convert messages to Gemini history format
    const history = opts.messages.slice(0, -1).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = opts.messages[opts.messages.length - 1];
    if (!lastMessage) throw new Error('No messages to send');

    const chat = model.startChat({ history });

    const result = await chat.sendMessageStream(lastMessage.content);

    for await (const chunk of result.stream) {
      if (opts.signal?.aborted) break;
      const text = chunk.text();
      if (text) yield text;
    }
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
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-2.5-pro',
      'gemini-pro-latest',
      'gemini-2.5-flash-lite',
    ];
  }
}
