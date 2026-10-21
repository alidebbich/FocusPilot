import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IPC, DEFAULT_SETTINGS } from '../../shared/types';
import type { AppSettings } from '../../shared/types';

const SETTINGS_FILE_NAME = 'settings.json';

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE_NAME);
}

function readSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    // Normalize deprecated or invalid model IDs to a known-valid default
    const VALID_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']);
    if (
      merged.model &&
      (merged.model.startsWith('gemini-1.5') ||
        merged.model.startsWith('gemini-2.0') ||
        !VALID_MODELS.has(merged.model))
    ) {
      merged.model = 'gemini-2.5-flash';
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: AppSettings): void {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => {
    return readSettings();
  });

  ipcMain.handle(IPC.SETTINGS_SET, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid settings payload');
    }
    const current = readSettings();
    const updated: AppSettings = { ...current, ...(payload as Partial<AppSettings>) };
    writeSettings(updated);
  });
}
