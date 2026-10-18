import { ipcMain, desktopCapturer } from 'electron';
import * as crypto from 'crypto';
import { IPC } from '../../shared/types';
import type { ScreenSource, ScreenCaptureResult } from '../../shared/types';

// Track previous frame hash to detect screen changes and save cloud API quota
let lastCaptureHash: string | null = null;
let lastCaptureTimestamp: number = 0;

export function registerScreenHandlers(): void {
  // ─── List available screens & windows ─────────────────────────
  ipcMain.handle(IPC.SCREEN_SOURCES, async (): Promise<ScreenSource[]> => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: false,
      });

      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnailDataUrl: s.thumbnail.toDataURL(),
      }));
    } catch (err) {
      console.error('[Screen] Failed to get sources:', err);
      throw new Error('Failed to get screen sources: ' + (err instanceof Error ? err.message : String(err)));
    }
  });

  // ─── Capture single frame with change detection ───────────────
  ipcMain.handle(
    IPC.SCREEN_CAPTURE_FRAME,
    async (_event, payload?: { sourceId?: string; force?: boolean }): Promise<ScreenCaptureResult> => {
      try {
        const targetSourceId = payload?.sourceId;
        const types: ('screen' | 'window')[] = targetSourceId?.startsWith('window:')
          ? ['window']
          : ['screen'];

        // Capture at 1280x720 resolution to maintain sharp text while keeping payloads fast and quota-friendly
        const sources = await desktopCapturer.getSources({
          types,
          thumbnailSize: { width: 1280, height: 720 },
          fetchWindowIcons: false,
        });

        if (sources.length === 0) {
          return { ok: false, error: 'No display or window sources available to capture.' };
        }

        // Find requested source or default to primary screen / first available
        let selected = targetSourceId ? sources.find((s) => s.id === targetSourceId) : null;
        if (!selected) {
          // Prefer screen source first if no specific window requested
          selected = sources.find((s) => s.id.startsWith('screen:')) || sources[0];
        }

        const thumbnail = selected.thumbnail;
        const size = thumbnail.getSize();

        // Check if thumbnail is valid
        if (size.width === 0 || size.height === 0) {
          // If the screen capturer returned 0x0 (e.g. background thread issue or specific window hidden),
          // fallback to another available window source if present
          const fallback = sources.find((s) => s.thumbnail.getSize().width > 0);
          if (fallback) {
            selected = fallback;
          } else {
            return {
              ok: false,
              error: 'Capture device returned an empty frame. Ensure target window is open and visible.',
            };
          }
        }

        // Convert to optimized JPEG (quality 78% for crisp text with small payload size)
        const jpegBuffer = selected.thumbnail.toJPEG(78);
        const base64 = jpegBuffer.toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64}`;

        // Compute SHA-256 hash to detect changes
        const hash = crypto.createHash('sha256').update(jpegBuffer).digest('hex');
        const changed = payload?.force || hash !== lastCaptureHash;

        lastCaptureHash = hash;
        lastCaptureTimestamp = Date.now();

        const actualSize = selected.thumbnail.getSize();

        return {
          ok: true,
          dataUrl,
          base64,
          mimeType: 'image/jpeg',
          width: actualSize.width,
          height: actualSize.height,
          timestamp: lastCaptureTimestamp,
          sourceId: selected.id,
          sourceName: selected.name,
          hash,
          changed,
        };
      } catch (err) {
        console.error('[Screen] Frame capture failed:', err);
        return {
          ok: false,
          error: 'Screen capture failed: ' + (err instanceof Error ? err.message : String(err)),
        };
      }
    }
  );
}
