// ============================================================
// FocusPilot AI — Shared Types
// Shared between main process, preload, and renderer.
// ============================================================

// ─── Provider ────────────────────────────────────────────────
export type ProviderName = 'gemini' | 'openai' | 'grok';

export interface ProviderConfig {
  name: ProviderName;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ProviderStatus {
  configured: boolean;
  connected: boolean | null;
  provider: ProviderName | null;
  model: string | null;
  error?: string;
}

// ─── Messages ────────────────────────────────────────────────
export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

// ─── Conversations ───────────────────────────────────────────
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  systemInstruction?: string;
  messages: ChatMessage[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

// ─── Notes ───────────────────────────────────────────────────
export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

// ─── Interview ───────────────────────────────────────────────
export type InterviewDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type InterviewSubject =
  | 'javascript'
  | 'typescript'
  | 'react'
  | 'angular'
  | 'nodejs'
  | 'databases'
  | 'apis'
  | 'system-design'
  | 'algorithms'
  | 'debugging'
  | 'general';

export interface InterviewSession {
  id: string;
  subject: InterviewSubject;
  difficulty: InterviewDifficulty;
  startedAt: number;
  endedAt?: number;
  questions: InterviewQuestion[];
  summary?: string;
}

export interface InterviewQuestion {
  id: string;
  question: string;
  userAnswer: string;
  feedback: string;
  score?: number;
}

// ─── Transcription ───────────────────────────────────────────
export interface TranscriptSession {
  id: string;
  title: string;
  createdAt: number;
  duration?: number;
  transcript: string;
  summary?: string;
  micLabel?: string;
}

// ─── Screen Analysis ─────────────────────────────────────────
export interface ScreenAnalysis {
  id: string;
  question: string;
  imagePath?: string;
  result: string;
  createdAt: number;
}

// ─── Settings ────────────────────────────────────────────────
export interface AppSettings {
  provider: ProviderName;
  model: string;
  theme: 'dark' | 'light' | 'system';
  temperature: number;
  maxTokens: number;
  systemInstruction: string;
  preferredMicId?: string;
  dataRetentionDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'gemini',
  model: 'gemini-1.5-flash',
  theme: 'dark',
  temperature: 0.7,
  maxTokens: 4096,
  systemInstruction: '',
  dataRetentionDays: 90,
};

// ─── IPC Channel Names ───────────────────────────────────────
export const IPC = {
  // AI
  AI_SEND_MESSAGE: 'ai:send-message',
  AI_STREAM_START: 'ai:stream-start',
  AI_STREAM_CHUNK: 'ai:stream-chunk',
  AI_STREAM_END: 'ai:stream-end',
  AI_STREAM_ERROR: 'ai:stream-error',
  AI_CANCEL: 'ai:cancel',
  AI_TEST_CONNECTION: 'ai:test-connection',

  // Keys
  KEY_SET: 'key:set',
  KEY_GET_EXISTS: 'key:get-exists',
  KEY_DELETE: 'key:delete',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // Conversations
  CONV_LIST: 'conv:list',
  CONV_GET: 'conv:get',
  CONV_SAVE: 'conv:save',
  CONV_DELETE: 'conv:delete',
  CONV_CLEAR_ALL: 'conv:clear-all',

  // Notes
  NOTES_LIST: 'notes:list',
  NOTES_GET: 'notes:get',
  NOTES_SAVE: 'notes:save',
  NOTES_DELETE: 'notes:delete',

  // Interview
  INTERVIEW_LIST: 'interview:list',
  INTERVIEW_GET: 'interview:get',
  INTERVIEW_SAVE: 'interview:save',
  INTERVIEW_DELETE: 'interview:delete',

  // Transcripts
  TRANSCRIPT_LIST: 'transcript:list',
  TRANSCRIPT_SAVE: 'transcript:save',
  TRANSCRIPT_DELETE: 'transcript:delete',

  // Screen
  SCREEN_CAPTURE: 'screen:capture',
  SCREEN_SOURCES: 'screen:sources',

  // Diagnostics
  DIAG_GET: 'diag:get',
  DIAG_GET_VERSION: 'diag:get-version',

  // Data
  DATA_DELETE_ALL: 'data:delete-all',
} as const;

// ─── IPC Payloads ────────────────────────────────────────────
export interface AiSendMessagePayload {
  conversationId: string;
  messages: ChatMessage[];
  systemInstruction?: string;
  provider: ProviderName;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiResponse {
  text: string;
  conversationId: string;
}

export interface DiagnosticsReport {
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  features: DiagnosticsFeature[];
}

export interface DiagnosticsFeature {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'not-configured' | 'not-tested';
  detail?: string;
}

export interface ScreenSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
}
