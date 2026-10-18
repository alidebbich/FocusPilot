// Audio service types and interfaces

export type AudioSourceType = 'microphone' | 'system-audio';

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: string;
  isDefault?: boolean;
}

export type AudioSessionStatus = 'idle' | 'listening' | 'paused' | 'processing' | 'error';

export interface TranscriptSegment {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
  confidence?: number;
  isQuestion?: boolean;
}

export interface QuestionDetection {
  id: string;
  text: string;
  timestamp: number;
  confidence: number;
  source: 'audio' | 'manual';
}

export interface SttAdapterEvents {
  onTranscript: (segment: TranscriptSegment) => void;
  onError: (error: string) => void;
  onStatusChange: (status: AudioSessionStatus) => void;
}

export interface SttAdapter {
  readonly name: string;
  isSupported(): boolean;
  start(options?: { language?: string }): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
  setEvents(events: Partial<SttAdapterEvents>): void;
}
