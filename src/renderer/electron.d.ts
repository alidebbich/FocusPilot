// Type declaration for the Electron preload API exposed via contextBridge
export {};

declare global {
  interface Window {
    api: {
      window: {
        minimize: () => void;
        close: () => void;
        setAlwaysOnTop: (flag: boolean) => Promise<boolean>;
        getAlwaysOnTop: () => Promise<boolean>;
        setOpacity: (val: number) => Promise<void>;
        toggleCollapse: () => Promise<boolean>;
        getCollapsed: () => Promise<boolean>;
        setContentProtection: (flag: boolean) => Promise<boolean>;
        getContentProtection: () => Promise<boolean>;
      };
      hotkeys: {
        onToggleAssistant: (cb: () => void) => () => void;
      };
      ai: {
        sendMessage: (payload: {
          conversationId: string;
          messages: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>;
          systemInstruction?: string;
          provider: string;
          model: string;
          temperature?: number;
          maxTokens?: number;
          imageContext?: import('../shared/types').ImageContext;
          audioContext?: import('../shared/types').AudioTranscriptContext;
        }) => Promise<string>;
        testConnection: (provider: string, model: string) => Promise<{ ok: boolean; error?: string }>;
        cancel: () => void;
        onStreamChunk: (cb: (chunk: string) => void) => () => void;
        onStreamEnd: (cb: () => void) => () => void;
        onStreamError: (cb: (error: string) => void) => () => void;
      };
      keys: {
        set: (provider: string, key: string) => Promise<void>;
        exists: (provider: string) => Promise<boolean>;
        delete: (provider: string) => Promise<void>;
      };
      settings: {
        get: () => Promise<import('../shared/types').AppSettings>;
        set: (settings: Partial<import('../shared/types').AppSettings>) => Promise<void>;
      };
      conversations: {
        list: () => Promise<import('../shared/types').ConversationSummary[]>;
        get: (id: string) => Promise<import('../shared/types').Conversation | null>;
        save: (conversation: import('../shared/types').Conversation) => Promise<void>;
        delete: (id: string) => Promise<void>;
        clearAll: () => Promise<void>;
      };
      notes: {
        list: () => Promise<import('../shared/types').Note[]>;
        get: (id: string) => Promise<import('../shared/types').Note | null>;
        save: (note: import('../shared/types').Note) => Promise<void>;
        delete: (id: string) => Promise<void>;
      };
      interviews: {
        list: () => Promise<import('../shared/types').InterviewSession[]>;
        get: (id: string) => Promise<import('../shared/types').InterviewSession | null>;
        save: (session: import('../shared/types').InterviewSession) => Promise<void>;
        delete: (id: string) => Promise<void>;
      };
      transcripts: {
        list: () => Promise<import('../shared/types').TranscriptSession[]>;
        save: (session: import('../shared/types').TranscriptSession) => Promise<void>;
        delete: (id: string) => Promise<void>;
      };
      audio: {
        transcribe: (payload: {
          audioBase64: string;
          mimeType?: string;
          language?: string;
          provider?: string;
        }) => Promise<{ text: string }>;
        checkStatus: () => Promise<{ geminiConfigured: boolean; supportedProviders: string[] }>;
      };
      screen: {
        getSources: () => Promise<import('../shared/types').ScreenSource[]>;
        captureFrame: (payload?: { sourceId?: string; force?: boolean }) => Promise<import('../shared/types').ScreenCaptureResult>;
      };
      diag: {
        get: () => Promise<import('../shared/types').DiagnosticsReport>;
      };
      data: {
        deleteAll: () => Promise<void>;
      };
    };
  }
}
