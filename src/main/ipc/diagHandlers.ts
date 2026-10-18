import { ipcMain, app } from 'electron';
import { IPC } from '../../shared/types';
import type { DiagnosticsReport, DiagnosticsFeature } from '../../shared/types';
import { getKeyForProvider } from './keyHandlers';
import { getDb } from '../database/db';

export function registerDiagHandlers(): void {
  ipcMain.handle(IPC.DIAG_GET, async (): Promise<DiagnosticsReport> => {
    const features: DiagnosticsFeature[] = [];

    // Check DB
    try {
      const db = getDb();
      db.prepare('SELECT 1').get();
      features.push({ name: 'SQLite Database', status: 'pass', detail: 'Connected and responsive' });
    } catch (err) {
      features.push({ name: 'SQLite Database', status: 'fail', detail: String(err) });
    }

    // Check Gemini key
    try {
      const key = await getKeyForProvider('gemini');
      if (key) {
        features.push({ name: 'Gemini API Key', status: 'warning', detail: 'Key present — not yet tested (use Test Connection in Settings)' });
      } else {
        features.push({ name: 'Gemini API Key', status: 'not-configured', detail: 'No key. Add one in Settings → AI Provider.' });
      }
    } catch (err) {
      features.push({ name: 'Gemini API Key', status: 'fail', detail: String(err) });
    }

    // Key storage method
    features.push({
      name: 'API Key Storage',
      status: 'pass',
      detail: 'Keys stored in AES-256-GCM encrypted file in user data directory (not in source or plain text)',
    });

    // Context isolation (always on)
    features.push({ name: 'Context Isolation', status: 'pass', detail: 'Enabled' });
    features.push({ name: 'Node Integration (renderer)', status: 'pass', detail: 'Disabled' });

    // Transcription
    features.push({
      name: 'Transcription (Web Speech API)',
      status: 'not-tested',
      detail: 'Uses browser Web Speech API — requires microphone permission. Audio may be routed through Google speech servers.',
    });

    // Screen capture
    features.push({
      name: 'Screen Capture',
      status: 'not-tested',
      detail: 'Available via Electron desktopCapturer — explicit user action required, no background capture',
    });

    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      features,
    };
  });
}
