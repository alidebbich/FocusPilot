import { ipcMain, desktopCapturer } from 'electron';
import { IPC } from '../../shared/types';
import type { ScreenSource } from '../../shared/types';

export function registerScreenHandlers(): void {
  ipcMain.handle(IPC.SCREEN_SOURCES, async (): Promise<ScreenSource[]> => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 320, height: 180 },
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
}
