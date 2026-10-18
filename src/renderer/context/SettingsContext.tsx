import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AppSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  loading: boolean;
  hasApiKey: boolean;
  refreshKeyStatus: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  loading: true,
  hasApiKey: false,
  refreshKeyStatus: async () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const s = await window.api.settings.get();
      setSettings(s);
      await checkKey(s.provider);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function checkKey(provider: AppSettings['provider']) {
    try {
      const exists = await window.api.keys.exists(provider);
      setHasApiKey(exists);
    } catch {
      setHasApiKey(false);
    }
  }

  async function updateSettings(partial: Partial<AppSettings>) {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    await window.api.settings.set(partial);
    if (partial.provider) await checkKey(partial.provider);
  }

  async function refreshKeyStatus() {
    await checkKey(settings.provider);
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, loading, hasApiKey, refreshKeyStatus }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
