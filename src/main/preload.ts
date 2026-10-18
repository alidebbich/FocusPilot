import { contextBridge, ipcRenderer } from 'electron';
import type {
  AiSendMessagePayload,
  AppSettings,
  Conversation,
  ConversationSummary,
  Note,
  InterviewSession,
  TranscriptSession,
  ProviderName,
  ScreenSource,
} from '../shared/types';
const IPC = {
  AI_SEND_MESSAGE: 'ai:send-message',
  AI_STREAM_START: 'ai:stream-start',
  AI_STREAM_CHUNK: 'ai:stream-chunk',
  AI_STREAM_END: 'ai:stream-end',
  AI_STREAM_ERROR: 'ai:stream-error',
  AI_CANCEL: 'ai:cancel',
  AI_TEST_CONNECTION: 'ai:test-connection',
  KEY_SET: 'key:set',
  KEY_GET_EXISTS: 'key:get-exists',
  KEY_DELETE: 'key:delete',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  CONV_LIST: 'conv:list',
  CONV_GET: 'conv:get',
  CONV_SAVE: 'conv:save',
  CONV_DELETE: 'conv:delete',
  CONV_CLEAR_ALL: 'conv:clear-all',
  NOTES_LIST: 'notes:list',
  NOTES_GET: 'notes:get',
  NOTES_SAVE: 'notes:save',
  NOTES_DELETE: 'notes:delete',
  INTERVIEW_LIST: 'interview:list',
  INTERVIEW_GET: 'interview:get',
  INTERVIEW_SAVE: 'interview:save',
  INTERVIEW_DELETE: 'interview:delete',
  TRANSCRIPT_LIST: 'transcript:list',
  TRANSCRIPT_SAVE: 'transcript:save',
  TRANSCRIPT_DELETE: 'transcript:delete',
  SCREEN_CAPTURE: 'screen:capture',
  SCREEN_SOURCES: 'screen:sources',
  DIAG_GET: 'diag:get',
  DIAG_GET_VERSION: 'diag:get-version',
  DATA_DELETE_ALL: 'data:delete-all',
} as const;

// ─── Narrow typed API exposed to renderer ────────────────────
const api = {
  // AI
  ai: {
    sendMessage: (payload: AiSendMessagePayload): Promise<string> =>
      ipcRenderer.invoke(IPC.AI_SEND_MESSAGE, payload),
    testConnection: (provider: ProviderName, model: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.AI_TEST_CONNECTION, { provider, model }),
    cancel: () => ipcRenderer.send(IPC.AI_CANCEL),
    onStreamChunk: (cb: (chunk: string) => void) => {
      const handler = (_: unknown, chunk: string) => cb(chunk);
      ipcRenderer.on(IPC.AI_STREAM_CHUNK, handler);
      return () => ipcRenderer.removeListener(IPC.AI_STREAM_CHUNK, handler);
    },
    onStreamEnd: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on(IPC.AI_STREAM_END, handler);
      return () => ipcRenderer.removeListener(IPC.AI_STREAM_END, handler);
    },
    onStreamError: (cb: (error: string) => void) => {
      const handler = (_: unknown, error: string) => cb(error);
      ipcRenderer.on(IPC.AI_STREAM_ERROR, handler);
      return () => ipcRenderer.removeListener(IPC.AI_STREAM_ERROR, handler);
    },
  },

  // Key management
  keys: {
    set: (provider: ProviderName, key: string): Promise<void> =>
      ipcRenderer.invoke(IPC.KEY_SET, { provider, key }),
    exists: (provider: ProviderName): Promise<boolean> =>
      ipcRenderer.invoke(IPC.KEY_GET_EXISTS, { provider }),
    delete: (provider: ProviderName): Promise<void> =>
      ipcRenderer.invoke(IPC.KEY_DELETE, { provider }),
  },

  // Settings
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (settings: Partial<AppSettings>): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET, settings),
  },

  // Conversations
  conversations: {
    list: (): Promise<ConversationSummary[]> => ipcRenderer.invoke(IPC.CONV_LIST),
    get: (id: string): Promise<Conversation | null> => ipcRenderer.invoke(IPC.CONV_GET, { id }),
    save: (conversation: Conversation): Promise<void> =>
      ipcRenderer.invoke(IPC.CONV_SAVE, conversation),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.CONV_DELETE, { id }),
    clearAll: (): Promise<void> => ipcRenderer.invoke(IPC.CONV_CLEAR_ALL),
  },

  // Notes
  notes: {
    list: (): Promise<Note[]> => ipcRenderer.invoke(IPC.NOTES_LIST),
    get: (id: string): Promise<Note | null> => ipcRenderer.invoke(IPC.NOTES_GET, { id }),
    save: (note: Note): Promise<void> => ipcRenderer.invoke(IPC.NOTES_SAVE, note),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.NOTES_DELETE, { id }),
  },

  // Interviews
  interviews: {
    list: (): Promise<InterviewSession[]> => ipcRenderer.invoke(IPC.INTERVIEW_LIST),
    get: (id: string): Promise<InterviewSession | null> =>
      ipcRenderer.invoke(IPC.INTERVIEW_GET, { id }),
    save: (session: InterviewSession): Promise<void> =>
      ipcRenderer.invoke(IPC.INTERVIEW_SAVE, session),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.INTERVIEW_DELETE, { id }),
  },

  // Transcripts
  transcripts: {
    list: (): Promise<TranscriptSession[]> => ipcRenderer.invoke(IPC.TRANSCRIPT_LIST),
    save: (session: TranscriptSession): Promise<void> =>
      ipcRenderer.invoke(IPC.TRANSCRIPT_SAVE, session),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TRANSCRIPT_DELETE, { id }),
  },

  // Screen
  screen: {
    getSources: (): Promise<ScreenSource[]> => ipcRenderer.invoke(IPC.SCREEN_SOURCES),
  },

  // Diagnostics
  diag: {
    get: (): Promise<import('../shared/types').DiagnosticsReport> =>
      ipcRenderer.invoke(IPC.DIAG_GET),
  },

  // Data management
  data: {
    deleteAll: (): Promise<void> => ipcRenderer.invoke(IPC.DATA_DELETE_ALL),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;
