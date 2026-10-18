import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { IPC } from '../../shared/types';
import type { ProviderName } from '../../shared/types';

// ─── Secure key storage ──────────────────────────────────────
// Keys are stored in a file in the user's app data directory,
// encrypted with a machine-derived key. This is not as secure
// as the OS credential store (keytar), but does not store keys
// in plain text. The encryption key is derived from a machine-
// specific seed (not stored in the file).
//
// For production use, install keytar: npm install keytar
// and re-enable it above. This fallback prevents keys from being
// in any committed config file while still persisting them.

const KEYS_FILE_NAME = 'provider-keys.enc';
const ALGO = 'aes-256-gcm';

function getKeysFilePath(): string {
  return path.join(app.getPath('userData'), KEYS_FILE_NAME);
}

// Derive a machine-specific encryption key from a fixed salt + machine ID approximation
function getDerivedKey(): Buffer {
  const seed = `focuspilot-${process.platform}-${app.getPath('userData').length}`;
  return crypto.scryptSync(seed, 'focuspilot-salt-v1', 32);
}

function loadKeys(): Record<string, string> {
  try {
    const filePath = getKeysFilePath();
    if (!fs.existsSync(filePath)) return {};

    const raw = fs.readFileSync(filePath);
    const iv = raw.subarray(0, 16);
    const authTag = raw.subarray(16, 32);
    const ciphertext = raw.subarray(32);

    const decipher = crypto.createDecipheriv(ALGO, getDerivedKey(), iv) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8'));
  } catch {
    return {};
  }
}

function saveKeys(keys: Record<string, string>): void {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getDerivedKey(), iv) as crypto.CipherGCM;
  const plaintext = Buffer.from(JSON.stringify(keys), 'utf-8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, ciphertext]);
  fs.writeFileSync(getKeysFilePath(), combined);
}

export async function getKeyForProvider(provider: string): Promise<string | null> {
  const keys = loadKeys();
  if (keys[provider] && keys[provider].trim().length > 0) {
    return keys[provider].trim();
  }

  // Fallback to process.env if present
  if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY.trim();
  }
  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY.trim();
  }
  if (provider === 'grok' && process.env.GROK_API_KEY) {
    return process.env.GROK_API_KEY.trim();
  }

  return null;
}

export function registerKeyHandlers(): void {
  ipcMain.handle(IPC.KEY_SET, (_event, payload: unknown) => {
    if (!isKeyPayload(payload) || typeof (payload as { key?: unknown }).key !== 'string') {
      throw new Error('Invalid key payload');
    }
    const { provider, key } = payload as { provider: ProviderName; key: string };
    if (!key || key.trim().length === 0) throw new Error('API key cannot be empty');

    const keys = loadKeys();
    keys[provider] = key.trim();
    saveKeys(keys);
    console.log(`[Keys] Key saved (encrypted) for provider: ${provider}`);
  });

  ipcMain.handle(IPC.KEY_GET_EXISTS, async (_event, payload: unknown) => {
    if (!isKeyPayload(payload)) return false;
    const { provider } = payload as { provider: ProviderName };
    const key = await getKeyForProvider(provider);
    return !!(key && key.length > 0);
  });

  ipcMain.handle(IPC.KEY_DELETE, (_event, payload: unknown) => {
    if (!isKeyPayload(payload)) throw new Error('Invalid key payload');
    const { provider } = payload as { provider: ProviderName };
    const keys = loadKeys();
    delete keys[provider];
    saveKeys(keys);
    console.log(`[Keys] Key deleted for provider: ${provider}`);
  });
}

function isKeyPayload(v: unknown): v is { provider: string } {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { provider?: unknown }).provider === 'string'
  );
}
