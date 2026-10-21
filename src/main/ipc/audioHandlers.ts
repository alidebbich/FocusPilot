import { ipcMain } from 'electron';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { IPC } from '../../shared/types';
import type { ProviderName } from '../../shared/types';
import { getKeyForProvider } from './keyHandlers';

interface AudioTranscribePayload {
  audioBase64: string;
  mimeType?: string;
  language?: string;
  provider?: ProviderName;
}

export function registerAudioHandlers(): void {
  ipcMain.handle(IPC.AUDIO_TRANSCRIBE, async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid audio transcription payload');
    }

    const { audioBase64, mimeType = 'audio/wav', language = 'en-US', provider = 'gemini' } =
      payload as AudioTranscribePayload;

    if (!audioBase64 || typeof audioBase64 !== 'string' || audioBase64.length === 0) {
      return { text: '' };
    }

    const apiKey = await getKeyForProvider(provider);
    if (!apiKey) {
      throw new Error(
        `No API key configured for ${provider.toUpperCase()}. Please add your API key in Settings → AI Provider.`
      );
    }

    if (provider === 'gemini') {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256,
          },
        });

        const prompt =
          `You are an accurate, real-time speech-to-text engine. Transcribe the spoken speech in this audio clip verbatim in ${language}. ` +
          `If there is no discernible speech, background silence only, keyboard clicks, or non-verbal noise, output exactly "[NO_SPEECH]". ` +
          `Do NOT add any preamble, conversational commentary, timestamps, or markdown formatting. Output ONLY the spoken transcript text.`;

        const result = await model.generateContent([
          {
            inlineData: {
              data: audioBase64,
              mimeType,
            },
          },
          prompt,
        ]);

        const rawText = result.response.text()?.trim() || '';

        // Filter out silence markers or empty tokens
        if (
          !rawText ||
          rawText === '[NO_SPEECH]' ||
          rawText === 'NO_SPEECH' ||
          rawText === '[SILENCE]' ||
          rawText.toLowerCase() === 'no speech' ||
          rawText === '...' ||
          rawText === '.'
        ) {
          return { text: '' };
        }

        // Clean any enclosing quotation marks if output as a quote
        let cleaned = rawText;
        if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length > 2) {
          cleaned = cleaned.slice(1, -1).trim();
        }

        return { text: cleaned };
      } catch (err: any) {
        const msg = String(err?.message || err);
        const status = err?.status || err?.statusCode;

        if (status === 401 || status === 403 || msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
          throw new Error('Invalid Gemini API key. Please verify your API key in Settings.');
        }

        if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
          throw new Error('Gemini API quota or rate limit exceeded. Please check your AI Studio plan.');
        }

        if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('network')) {
          throw new Error('Network connection failed while reaching Gemini speech service. Check internet connection.');
        }

        console.error('[AudioHandlers] Transcription error:', msg);
        throw new Error(`Speech transcription failed: ${msg}`);
      }
    } else {
      throw new Error(`Provider "${provider}" does not currently support audio transcription.`);
    }
  });

  ipcMain.handle(IPC.AUDIO_CHECK_STATUS, async () => {
    const geminiKey = await getKeyForProvider('gemini');
    return {
      geminiConfigured: !!(geminiKey && geminiKey.length > 0),
      supportedProviders: ['gemini'],
    };
  });
}
