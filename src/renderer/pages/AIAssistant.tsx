import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { v4 as uuidv4 } from 'uuid';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import type { ChatMessage, Conversation } from '../../shared/types';

export default function AIAssistant() {
  const { settings, hasApiKey } = useSettings();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Stream listeners
  useEffect(() => {
    const removeChunk = window.api.ai.onStreamChunk((chunk) => {
      setStreamingText((prev) => prev + chunk);
    });
    const removeEnd = window.api.ai.onStreamEnd(() => {
      setStreaming(false);
    });
    const removeErr = window.api.ai.onStreamError((err) => {
      setError(err);
      setStreaming(false);
      setStreamingText('');
    });
    return () => {
      removeChunk();
      removeEnd();
      removeErr();
    };
  }, []);

  // When streaming ends, save the assistant message
  useEffect(() => {
    if (!streaming && streamingText) {
      const assistantMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: streamingText,
        timestamp: Date.now(),
      };
      setMessages((prev) => {
        const updated = [...prev, assistantMsg];
        saveConversation(updated);
        return updated;
      });
      setStreamingText('');
    }
  }, [streaming]);

  async function loadConversations() {
    try {
      const list = await window.api.conversations.list();
      // Load full objects for the sidebar
      setConversations(list.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messages: [],
      })));
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }

  async function openConversation(id: string) {
    try {
      const conv = await window.api.conversations.get(id);
      if (conv) {
        setActiveConvId(conv.id);
        setMessages(conv.messages);
        setError(null);
      }
    } catch {
      showToast('error', 'Failed to load conversation');
    }
  }

  function newConversation() {
    setActiveConvId(null);
    setMessages([]);
    setError(null);
    setStreamingText('');
  }

  async function saveConversation(msgs: ChatMessage[]) {
    const id = activeConvId ?? uuidv4();
    const firstUserMsg = msgs.find((m) => m.role === 'user');
    const title = firstUserMsg
      ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? '…' : '')
      : 'New conversation';

    const conv: Conversation = {
      id,
      title,
      createdAt: msgs[0]?.timestamp ?? Date.now(),
      updatedAt: Date.now(),
      messages: msgs,
      systemInstruction: settings.systemInstruction || undefined,
    };

    if (!activeConvId) setActiveConvId(id);

    try {
      await window.api.conversations.save(conv);
      await loadConversations();
    } catch (err) {
      console.error('Failed to save conversation:', err);
    }
  }

  async function sendMessage() {
    if (!input.trim() || streaming) return;
    if (!hasApiKey) {
      showToast('error', 'No API key configured. Go to Settings to add your key.');
      navigate('/settings');
      return;
    }

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setError(null);
    setStreaming(true);
    setStreamingText('');
    abortRef.current = false;

    try {
      await window.api.ai.sendMessage({
        conversationId: activeConvId ?? uuidv4(),
        messages: updatedMessages,
        systemInstruction: settings.systemInstruction || undefined,
        provider: settings.provider,
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStreaming(false);
      setStreamingText('');
    }
  }

  function cancelStream() {
    window.api.ai.cancel();
    setStreaming(false);
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await window.api.conversations.delete(id);
    if (activeConvId === id) newConversation();
    await loadConversations();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const allMessages: Array<ChatMessage & { isStreaming?: boolean }> = streamingText
    ? [...messages, { id: 'streaming', role: 'assistant', content: streamingText, timestamp: Date.now(), isStreaming: true }]
    : messages;

  return (
    <div className="flex h-full">
      {/* Sidebar: Conversation list */}
      <aside className="w-56 min-w-56 border-r border-charcoal-800 bg-charcoal-900/30 flex flex-col">
        <div className="p-3 border-b border-charcoal-800">
          <button className="btn-primary w-full btn-sm" onClick={newConversation}>
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {conversations.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4 px-2">
              No conversations yet. Start a new chat!
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center justify-between px-3 py-2 rounded-lg mb-0.5 cursor-pointer text-sm transition-all
                  ${activeConvId === conv.id ? 'bg-violet-600/20 text-violet-300' : 'text-gray-400 hover:bg-charcoal-800 hover:text-gray-200'}`}
                onClick={() => openConversation(conv.id)}
              >
                <span className="truncate flex-1 text-xs">{conv.title}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 ml-1 flex-shrink-0"
                  onClick={(e) => deleteConversation(conv.id, e)}
                  title="Delete conversation"
                >✕</button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {allMessages.length === 0 && !error ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-4xl mb-4 text-charcoal-600">✦</div>
              <h3 className="text-lg font-semibold text-gray-300 mb-2">AI Assistant</h3>
              <p className="text-gray-500 text-sm max-w-sm">
                Ask any question, get explanations, brainstorm ideas, or practice concepts.
              </p>
              {!hasApiKey && (
                <div className="mt-4 p-3 rounded-lg border border-yellow-800/50 bg-yellow-900/10 text-xs text-yellow-400">
                  Configure your API key in Settings to enable AI responses.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {allMessages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} isStreaming={msg.isStreaming} />
              ))}
              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-red-800 bg-red-900/10">
                  <span className="text-red-400 flex-shrink-0 mt-0.5">✕</span>
                  <div className="flex-1">
                    <p className="text-sm text-red-300">{error}</p>
                    <button className="text-xs text-red-400 hover:text-red-300 mt-2 underline" onClick={sendMessage}>
                      Retry
                    </button>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-charcoal-800 p-4 bg-charcoal-900/30">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3 items-end">
              <textarea
                ref={textareaRef}
                className="input flex-1 resize-none min-h-[44px] max-h-32"
                placeholder={hasApiKey ? "Ask anything… (Enter to send, Shift+Enter for newline)" : "Configure API key in Settings first"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={streaming || !hasApiKey}
                rows={1}
              />
              {streaming ? (
                <button className="btn-danger btn-sm flex-shrink-0" onClick={cancelStream}>
                  ■ Stop
                </button>
              ) : (
                <button
                  className="btn-primary btn-sm flex-shrink-0"
                  onClick={sendMessage}
                  disabled={!input.trim() || !hasApiKey}
                >
                  Send ↵
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-600">
                {streaming ? (
                  <span className="flex items-center gap-1.5 text-violet-400">
                    <span className="inline-block w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                    Generating…
                  </span>
                ) : `Model: ${settings.model}`}
              </p>
              {messages.length > 0 && (
                <button
                  className="text-xs text-gray-600 hover:text-red-400"
                  onClick={newConversation}
                >
                  Clear chat
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  function copyMessage() {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0 font-bold
        ${isUser ? 'bg-violet-600 text-white' : 'bg-charcoal-700 text-gray-300'}`}>
        {isUser ? 'U' : 'AI'}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
        <div className={`relative group rounded-xl px-4 py-3 max-w-full
          ${isUser
            ? 'bg-violet-600/20 border border-violet-700/40 text-gray-200 ml-8'
            : 'bg-charcoal-800 border border-charcoal-700 text-gray-200'
          }`}>
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose-dark text-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const isBlock = !!className;
                    if (isBlock) {
                      return (
                        <div className="relative group/code my-2">
                          <pre className="bg-charcoal-900 border border-charcoal-700 rounded-lg p-3 overflow-x-auto">
                            <code className="font-mono text-xs text-gray-300">{children}</code>
                          </pre>
                          <button
                            className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100
                                       text-xs px-2 py-1 rounded bg-charcoal-700 text-gray-400 hover:text-gray-200"
                            onClick={() => navigator.clipboard.writeText(String(children))}
                          >
                            Copy
                          </button>
                        </div>
                      );
                    }
                    return <code className="font-mono text-violet-300 bg-charcoal-900 px-1 py-0.5 rounded text-xs" {...props}>{children}</code>;
                  },
                  p({ children }) { return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>; },
                  ul({ children }) { return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>; },
                  ol({ children }) { return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>; },
                  h1({ children }) { return <h1 className="text-base font-bold mb-2 text-gray-100">{children}</h1>; },
                  h2({ children }) { return <h2 className="text-sm font-bold mb-1.5 text-gray-100">{children}</h2>; },
                  h3({ children }) { return <h3 className="text-sm font-semibold mb-1 text-gray-200">{children}</h3>; },
                  blockquote({ children }) { return <blockquote className="border-l-2 border-violet-600 pl-3 text-gray-400 italic">{children}</blockquote>; },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse ml-0.5 align-middle rounded-sm" />
              )}
            </div>
          )}
          {!isStreaming && (
            <button
              className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 text-xs px-2 py-0.5
                         bg-charcoal-700 border border-charcoal-600 rounded text-gray-400 hover:text-gray-200"
              onClick={copyMessage}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
