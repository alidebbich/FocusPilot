import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../components/Toast';
import { AudioCaptureService } from '../services/audio/AudioCaptureService';
import type { AudioDevice, TranscriptSession } from '../../shared/types';

type RecordingState = 'idle' | 'recording' | 'processing' | 'done';

const audioService = new AudioCaptureService();

export default function Transcription() {
  const { settings, hasApiKey } = useSettings();
  const { showToast } = useToast();
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [summary, setSummary] = useState('');
  const [duration, setDuration] = useState(0);
  const [micId, setMicId] = useState('');
  const [mics, setMics] = useState<AudioDevice[]>([]);
  const [sessions, setSessions] = useState<TranscriptSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [micError, setMicError] = useState('');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    loadMics();
    loadSessions();

    const unsubTranscript = audioService.onTranscript((seg) => {
      if (seg.isFinal) {
        setTranscript((prev) => (prev ? `${prev} ${seg.text}` : seg.text));
        setInterimText('');
      } else {
        setInterimText(seg.text);
      }
    });

    const unsubVolume = audioService.onVolumeLevel((vol) => {
      setVolumeLevel(vol);
    });

    const unsubError = audioService.onError((err) => {
      setMicError(err);
      showToast('error', err);
      setRecordingState('idle');
      if (timerRef.current) clearInterval(timerRef.current);
    });

    return () => {
      unsubTranscript();
      unsubVolume();
      unsubError();
      audioService.stopListening().catch(() => {});
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [showToast]);

  async function loadMics() {
    try {
      const devices = await audioService.getDevices();
      setMics(devices);
      if (devices[0]) setMicId(devices[0].deviceId);
      setMicError('');
    } catch (err: any) {
      setMicError('Microphone access denied. Please grant microphone permission.');
      console.error('Mic error:', err);
    }
  }

  async function loadSessions() {
    try {
      const list = await window.api.transcripts.list();
      setSessions(list);
    } catch (err) {
      console.error('Failed to load transcripts:', err);
    }
  }

  async function startRecording() {
    try {
      setMicError('');
      const { deviceLabel } = await audioService.startListening({
        deviceId: micId || undefined,
      });

      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      setRecordingState('recording');
      setTranscript('');
      setInterimText('');
      setSummary('');
      showToast('info', `Recording started on: ${deviceLabel}`);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setMicError(msg);
      setRecordingState('idle');
      showToast('error', msg);
    }
  }

  async function stopRecording() {
    await audioService.stopListening();
    if (timerRef.current) clearInterval(timerRef.current);
    setInterimText('');
    setRecordingState('done');
    setVolumeLevel(0);
    showToast('success', 'Recording stopped');
  }

  async function saveSession() {
    const session: TranscriptSession = {
      id: uuidv4(),
      title: `Session ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      duration,
      transcript: transcript.trim(),
      summary: summary || undefined,
      micLabel: mics.find((m) => m.deviceId === micId)?.label,
    };

    await window.api.transcripts.save(session);
    await loadSessions();
    showToast('success', 'Session saved');
    setRecordingState('idle');
    setTranscript('');
    setSummary('');
    setDuration(0);
  }

  async function generateSummary() {
    if (!transcript.trim() || !hasApiKey) return;
    setRecordingState('processing');

    try {
      const response = await window.api.ai.sendMessage({
        conversationId: uuidv4(),
        messages: [{
          id: uuidv4(),
          role: 'user',
          content: `Summarize the following transcript concisely. Identify key points, decisions made, and action items if any.\n\nTranscript:\n${transcript}`,
          timestamp: Date.now(),
        }],
        provider: settings.provider,
        model: settings.model,
        temperature: 0.3,
        maxTokens: 1024,
      });
      setSummary(response);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setRecordingState('done');
    }
  }

  async function deleteSession(id: string) {
    await window.api.transcripts.delete(id);
    await loadSessions();
    showToast('success', 'Session deleted');
  }

  function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="flex h-full">
      {/* Main area */}
      <div className="flex-1 flex flex-col p-6 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Transcription</h2>
            <p className="text-xs text-gray-500">
              FocusPilot Audio Engine — Real-time 16kHz speech recognition via Gemini AI.
            </p>
          </div>
          <button
            className="btn-secondary btn-sm"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? 'Hide History' : 'Show History'}
          </button>
        </div>

        {micError && (
          <div className="mb-4 p-3 rounded-lg border border-red-800 bg-red-900/10 text-xs text-red-300">
            {micError}
          </div>
        )}

        {/* Mic selection */}
        {mics.length > 0 && recordingState === 'idle' && (
          <div className="mb-4">
            <label className="section-title block mb-1">Microphone / Input Device</label>
            <select
              className="input max-w-xs"
              value={micId}
              onChange={(e) => setMicId(e.target.value)}
            >
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Recording controls */}
        <div className="flex items-center gap-4 mb-4">
          {recordingState === 'idle' && (
            <button className="btn-primary" onClick={startRecording} disabled={!hasApiKey}>
              ⏺ Start Recording
            </button>
          )}
          {recordingState === 'recording' && (
            <>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/20 border border-red-800">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-red-300 text-sm font-mono">{formatDuration(duration)}</span>
              </div>

              {/* Volume meter */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-charcoal-900 border border-charcoal-700">
                <span className="text-[11px] text-gray-400">Mic Level:</span>
                <div className="w-24 h-2 bg-charcoal-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-violet-500 transition-all duration-75"
                    style={{ width: `${volumeLevel}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 font-mono w-6">{volumeLevel}%</span>
              </div>

              <button className="btn-danger" onClick={stopRecording}>
                ■ Stop Recording
              </button>
            </>
          )}
          {recordingState === 'processing' && (
            <div className="flex items-center gap-2 text-violet-400 text-sm">
              <span className="w-4 h-4 border border-violet-400 border-t-transparent rounded-full animate-spin" />
              Generating summary…
            </div>
          )}
          {recordingState === 'done' && (
            <div className="flex items-center gap-3">
              <button className="btn-primary" onClick={saveSession} disabled={!transcript.trim()}>
                Save Session
              </button>
              {hasApiKey && transcript.trim() && (
                <button className="btn-secondary" onClick={generateSummary}>
                  Generate Summary
                </button>
              )}
              <button className="btn-ghost" onClick={() => {
                setRecordingState('idle');
                setTranscript('');
                setSummary('');
                setDuration(0);
              }}>
                Discard
              </button>
            </div>
          )}
        </div>

        {/* Live transcript */}
        {(recordingState === 'recording' || recordingState === 'done' || transcript) && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="section-title">Transcript</div>
            <div className="flex-1 rounded-xl border border-charcoal-700 bg-charcoal-900 p-4 overflow-y-auto font-mono text-sm text-gray-300 leading-relaxed">
              {transcript || (recordingState === 'recording' ? <span className="text-gray-600">Listening…</span> : '')}
              {interimText && (
                <span className="text-violet-400 italic ml-1">{interimText}</span>
              )}
              {!transcript && !interimText && recordingState === 'recording' && (
                <span className="text-gray-600 animate-pulse ml-1">●</span>
              )}
            </div>
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="mt-4 card">
            <div className="section-title">AI Summary</div>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{summary}</p>
          </div>
        )}

        {recordingState === 'idle' && !transcript && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl text-charcoal-700 mb-3">⏺</div>
              <p className="text-gray-400 text-sm font-medium">Ready to record</p>
              <p className="text-gray-600 text-xs mt-1">
                {hasApiKey
                  ? 'Click "Start Recording" to begin audio capture & transcription'
                  : 'Please configure your Gemini API key in Settings first'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* History sidebar */}
      {showHistory && (
        <aside className="w-72 border-l border-charcoal-800 p-4 overflow-y-auto">
          <div className="section-title">Past Sessions</div>
          {sessions.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">No sessions saved yet.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="card p-3 group">
                  <div className="flex items-start justify-between">
                    <p className="text-xs font-medium text-gray-300 flex-1 truncate">{s.title}</p>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 ml-1 text-xs"
                      onClick={() => deleteSession(s.id)}
                    >✕</button>
                  </div>
                  {s.duration && (
                    <p className="text-xs text-gray-600 mt-0.5">{formatDuration(s.duration)}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.transcript}</p>
                  <button
                    className="text-xs text-violet-400 hover:text-violet-300 mt-2"
                    onClick={() => {
                      setTranscript(s.transcript);
                      setSummary(s.summary ?? '');
                      setRecordingState('done');
                    }}
                  >
                    Load →
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
