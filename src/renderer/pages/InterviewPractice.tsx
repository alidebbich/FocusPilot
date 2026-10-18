import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import type { InterviewSession, InterviewQuestion, InterviewSubject, InterviewDifficulty } from '../../../shared/types';

const SUBJECTS: { value: InterviewSubject; label: string; icon: string }[] = [
  { value: 'javascript', label: 'JavaScript', icon: 'JS' },
  { value: 'typescript', label: 'TypeScript', icon: 'TS' },
  { value: 'react', label: 'React', icon: '⚛' },
  { value: 'angular', label: 'Angular', icon: 'Ng' },
  { value: 'nodejs', label: 'Node.js', icon: '⬡' },
  { value: 'databases', label: 'Databases', icon: '⊞' },
  { value: 'apis', label: 'APIs & REST', icon: '⇄' },
  { value: 'system-design', label: 'System Design', icon: '⊕' },
  { value: 'algorithms', label: 'Algorithms', icon: 'Σ' },
  { value: 'general', label: 'General SWE', icon: '⚙' },
];

const DIFFICULTIES: { value: InterviewDifficulty; label: string; color: string }[] = [
  { value: 'beginner', label: 'Beginner', color: 'badge-green' },
  { value: 'intermediate', label: 'Intermediate', color: 'badge-yellow' },
  { value: 'advanced', label: 'Advanced', color: 'badge-red' },
];

type Phase = 'setup' | 'question' | 'answer' | 'feedback' | 'summary';

export default function InterviewPractice() {
  const { settings, hasApiKey } = useSettings();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('setup');
  const [subject, setSubject] = useState<InterviewSubject>('javascript');
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>('intermediate');
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [userAnswer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  async function callAI(prompt: string): Promise<string> {
    const msgs = [{ id: uuidv4(), role: 'user' as const, content: prompt, timestamp: Date.now() }];
    return window.api.ai.sendMessage({
      conversationId: uuidv4(),
      messages: msgs,
      provider: settings.provider,
      model: settings.model,
      temperature: 0.7,
      maxTokens: 2048,
    });
  }

  async function startSession() {
    if (!hasApiKey) {
      showToast('error', 'No API key configured. Go to Settings.');
      navigate('/settings');
      return;
    }

    setLoading(true);
    setLoadingMsg('Generating your first question…');

    try {
      const prompt = `You are a technical interviewer conducting a ${difficulty} ${subject} interview.
Generate ONE interview question that tests the candidate's knowledge.
Format your response as ONLY the question text, no preamble.
The question should be clear, specific, and appropriate for ${difficulty} level.`;

      const question = await callAI(prompt);

      const newSession: InterviewSession = {
        id: uuidv4(),
        subject,
        difficulty,
        startedAt: Date.now(),
        questions: [],
      };

      setSession(newSession);
      setCurrentQuestion(question.trim());
      setAnswer('');
      setPhase('question');
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to generate question');
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer() {
    if (!userAnswer.trim() || !session) return;
    setLoading(true);
    setLoadingMsg('Evaluating your answer…');

    try {
      const prompt = `You are a technical interviewer evaluating a ${session.difficulty} ${session.subject} answer.

Question: ${currentQuestion}

Candidate's answer: ${userAnswer}

Provide structured feedback covering:
1. **Correctness** — Is the answer accurate?
2. **Completeness** — What key points were covered or missed?
3. **Clarity** — Was the explanation clear?
4. **Improvements** — Specific suggestions to improve the answer.
5. **Score** — Give a score out of 10.

Be constructive and encouraging. Format as markdown.`;

      const fb = await callAI(prompt);
      setFeedback(fb.trim());

      const question: InterviewQuestion = {
        id: uuidv4(),
        question: currentQuestion,
        userAnswer: userAnswer.trim(),
        feedback: fb.trim(),
      };

      const updatedSession = { ...session, questions: [...session.questions, question] };
      setSession(updatedSession);
      await window.api.interviews.save(updatedSession);

      setPhase('feedback');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to evaluate answer');
    } finally {
      setLoading(false);
    }
  }

  async function nextQuestion() {
    if (!session) return;
    setLoading(true);
    setLoadingMsg('Generating next question…');

    try {
      const history = session.questions
        .map((q, i) => `Q${i + 1}: ${q.question}`)
        .join('\n');

      const prompt = `You are a technical interviewer. This candidate has already been asked:
${history}

Generate ONE new ${session.difficulty} ${session.subject} interview question that hasn't been asked yet.
Format your response as ONLY the question text, no preamble.`;

      const question = await callAI(prompt);
      setCurrentQuestion(question.trim());
      setAnswer('');
      setFeedback('');
      setPhase('question');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to generate question');
    } finally {
      setLoading(false);
    }
  }

  async function endSession() {
    if (!session || session.questions.length === 0) {
      setPhase('setup');
      setSession(null);
      return;
    }

    setLoading(true);
    setLoadingMsg('Generating session summary…');

    try {
      const qaSummary = session.questions
        .map((q, i) => `Q${i + 1}: ${q.question}\nAnswer: ${q.userAnswer}`)
        .join('\n\n');

      const prompt = `You are a technical interviewer. Provide a concise session summary for this ${session.difficulty} ${session.subject} interview:

${qaSummary}

Summarize:
1. Overall performance
2. Strengths demonstrated  
3. Key areas for improvement
4. Recommended study topics

Format as markdown.`;

      const summary = await callAI(prompt);
      const finalSession = { ...session, endedAt: Date.now(), summary: summary.trim() };
      setSession(finalSession);
      await window.api.interviews.save(finalSession);
      setPhase('summary');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to generate summary');
      setPhase('summary');
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400 text-sm">{loadingMsg}</p>
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className="p-6 max-w-2xl mx-auto animate-fade-in">
        <h2 className="text-xl font-bold text-gray-100 mb-1">Interview Practice</h2>
        <p className="text-gray-400 text-sm mb-6">
          Practice technical interviews with AI-powered questions and feedback.
        </p>

        <div className="card mb-5">
          <div className="section-title">Select Subject</div>
          <div className="grid grid-cols-5 gap-2">
            {SUBJECTS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSubject(s.value)}
                className={`p-3 rounded-lg border text-center transition-all cursor-pointer
                  ${subject === s.value
                    ? 'border-violet-600 bg-violet-600/20 text-violet-300'
                    : 'border-charcoal-600 bg-charcoal-900 text-gray-400 hover:border-charcoal-500 hover:text-gray-200'
                  }`}
              >
                <div className="text-lg font-bold mb-1">{s.icon}</div>
                <div className="text-xs">{s.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card mb-6">
          <div className="section-title">Difficulty</div>
          <div className="flex gap-3">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                onClick={() => setDifficulty(d.value)}
                className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-all cursor-pointer
                  ${difficulty === d.value
                    ? 'border-violet-600 bg-violet-600/20 text-violet-300'
                    : 'border-charcoal-600 bg-charcoal-900 text-gray-400 hover:border-charcoal-500 hover:text-gray-200'
                  }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <button className="btn-primary w-full" onClick={startSession} disabled={!hasApiKey}>
          {hasApiKey ? 'Start Mock Interview' : 'Configure API Key First'}
        </button>
      </div>
    );
  }

  if (phase === 'summary' && session) {
    return (
      <div className="p-6 max-w-2xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-100">Session Complete</h2>
            <p className="text-gray-500 text-sm capitalize">
              {session.difficulty} {session.subject} • {session.questions.length} question{session.questions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button className="btn-secondary btn-sm" onClick={() => { setPhase('setup'); setSession(null); }}>
            New Session
          </button>
        </div>

        {session.summary && (
          <div className="card mb-5 prose-dark text-sm">
            <div className="section-title">AI Summary</div>
            <ReactMarkdownSimple content={session.summary} />
          </div>
        )}

        <div className="space-y-4">
          <div className="section-title">Questions & Answers</div>
          {session.questions.map((q, i) => (
            <div key={q.id} className="card">
              <div className="text-xs text-violet-400 mb-2">Question {i + 1}</div>
              <p className="text-sm text-gray-200 mb-3">{q.question}</p>
              <div className="text-xs text-gray-500 mb-1">Your answer:</div>
              <p className="text-sm text-gray-400 italic mb-3 bg-charcoal-900 rounded p-2">{q.userAnswer}</p>
              <div className="text-xs text-gray-500 mb-1">Feedback:</div>
              <div className="prose-dark text-sm text-gray-300">
                <ReactMarkdownSimple content={q.feedback} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      {/* Session header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="badge badge-violet capitalize">{session?.subject}</span>
          <span className={`badge ${
            session?.difficulty === 'beginner' ? 'badge-green' :
            session?.difficulty === 'intermediate' ? 'badge-yellow' : 'badge-red'
          } capitalize`}>{session?.difficulty}</span>
          <span className="text-xs text-gray-500">
            Question {(session?.questions.length ?? 0) + (phase === 'feedback' ? 0 : 1)}
          </span>
        </div>
        <button className="btn-ghost btn-sm text-red-400 hover:text-red-300" onClick={endSession}>
          End Session
        </button>
      </div>

      {/* Question */}
      <div className="card mb-4">
        <div className="section-title">Question</div>
        <p className="text-gray-200 text-sm leading-relaxed">{currentQuestion}</p>
      </div>

      {/* Answer input */}
      {phase === 'question' && (
        <>
          <div className="mb-4">
            <label className="section-title block mb-2">Your Answer</label>
            <textarea
              className="input w-full min-h-[120px] resize-y"
              placeholder="Type your answer here. Be as detailed as you like…"
              value={userAnswer}
              onChange={(e) => setAnswer(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button className="btn-primary flex-1" onClick={submitAnswer} disabled={!userAnswer.trim()}>
              Submit Answer
            </button>
            <button className="btn-secondary" onClick={endSession}>
              End Session
            </button>
          </div>
        </>
      )}

      {/* Feedback */}
      {phase === 'feedback' && (
        <>
          <div className="card mb-4">
            <div className="section-title">Your Answer</div>
            <p className="text-sm text-gray-400 italic">{userAnswer}</p>
          </div>
          <div className="card mb-5 prose-dark text-sm">
            <div className="section-title">AI Feedback</div>
            <ReactMarkdownSimple content={feedback} />
          </div>
          <div className="flex gap-3">
            <button className="btn-primary flex-1" onClick={nextQuestion}>
              Next Question →
            </button>
            <button className="btn-secondary" onClick={endSession}>
              End & Summarize
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ReactMarkdownSimple({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p({ children }) { return <p className="mb-2 last:mb-0">{children}</p>; },
        ul({ children }) { return <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>; },
        ol({ children }) { return <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>; },
        strong({ children }) { return <strong className="font-semibold text-gray-100">{children}</strong>; },
        code({ children }) { return <code className="font-mono text-violet-300 text-xs bg-charcoal-900 px-1 py-0.5 rounded">{children}</code>; },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

