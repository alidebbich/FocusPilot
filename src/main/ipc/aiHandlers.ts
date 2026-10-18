import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '../../shared/types';
import type { AiSendMessagePayload } from '../../shared/types';
import { GeminiProvider } from '../providers/geminiProvider';
import { getKeyForProvider } from './keyHandlers';

let activeAbortController: AbortController | null = null;

export function registerAiHandlers(): void {
  // ─── Send message (streaming) ───────────────────────────────
  ipcMain.handle(IPC.AI_SEND_MESSAGE, async (event, payload: unknown) => {
    // Validate payload shape
    if (!isAiSendMessagePayload(payload)) {
      throw new Error('Invalid AI send-message payload');
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No window associated with sender');

    // Cancel any in-progress request
    activeAbortController?.abort();
    activeAbortController = new AbortController();
    const { signal } = activeAbortController;

    const apiKey = await getKeyForProvider(payload.provider);
    if (!apiKey) {
      throw new Error(
        `No API key configured for provider "${payload.provider}". Please add your key in Settings.`
      );
    }

    try {
      let fullText = '';

      if (payload.provider === 'gemini') {
        const provider = new GeminiProvider(apiKey);
        const stream = provider.streamMessage({
          messages: payload.messages,
          systemInstruction: payload.systemInstruction,
          model: payload.model,
          temperature: payload.temperature,
          maxTokens: payload.maxTokens,
          signal,
        });

        for await (const chunk of stream) {
          if (signal.aborted) break;
          fullText += chunk;
          win.webContents.send(IPC.AI_STREAM_CHUNK, chunk);
        }

        win.webContents.send(IPC.AI_STREAM_END);
        return fullText;
      } else {
        throw new Error(
          `Provider "${payload.provider}" is not yet implemented. Only "gemini" is currently supported.`
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('aborted') || message.includes('cancelled')) {
        win.webContents.send(IPC.AI_STREAM_END);
        return '';
      }
      win.webContents.send(IPC.AI_STREAM_ERROR, message);
      throw new Error(message);
    }
  });

  // ─── Test connection ─────────────────────────────────────────
  ipcMain.handle(IPC.AI_TEST_CONNECTION, async (_event, payload: unknown) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof (payload as { provider?: unknown }).provider !== 'string' ||
      typeof (payload as { model?: unknown }).model !== 'string'
    ) {
      return { ok: false, error: 'Invalid test payload' };
    }

    const { provider, model } = payload as { provider: string; model: string };

    try {
      const apiKey = await getKeyForProvider(provider as 'gemini');
      if (!apiKey) {
        return { ok: false, error: 'No API key configured. Add your key in Settings.' };
      }

      if (provider === 'gemini') {
        const gemini = new GeminiProvider(apiKey);
        await gemini.testConnection(model);
        return { ok: true };
      }

      return { ok: false, error: `Provider "${provider}" not yet implemented.` };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ─── Cancel ──────────────────────────────────────────────────
  ipcMain.on(IPC.AI_CANCEL, () => {
    activeAbortController?.abort();
    activeAbortController = null;
  });
}

function isAiSendMessagePayload(v: unknown): v is AiSendMessagePayload {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.conversationId === 'string' &&
    Array.isArray(p.messages) &&
    typeof p.provider === 'string' &&
    typeof p.model === 'string'
  );
}
