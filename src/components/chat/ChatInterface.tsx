'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ApiClient, ApiError } from '@/lib/api/client';
import { DatabaseService } from '@/lib/db/database_service';
import type { ChatMessage } from '@/lib/db/models';
import { ChatMessageService } from '@/lib/db/services/chat_message_service';
import { ChatBubble } from './ChatBubble';

export type ChatMode = 'default' | 'explain' | 'quiz';

export interface ChatInterfaceProps {
  noteId: string;
  noteTitle: string;
  noteContent: string;
}

interface ChatApiResponse {
  answer: string;
  metadata?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
  };
}

const MAX_HISTORY_FOR_API = 10;

/**
 * Interactive AI study assistant chat interface with prompt modes, history persistence, and markdown support.
 */
export function ChatInterface({ noteId, noteTitle, noteContent }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedMode, setSelectedMode] = useState<ChatMode>('default');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history for the active note
  useEffect(() => {
    let active = true;
    const dbService = new DatabaseService();
    const chatService = new ChatMessageService(dbService);

    chatService
      .getByNote(noteId)
      .then((history) => {
        if (active) {
          setMessages(history);
          setIsHistoryLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load chat history:', err);
          setIsHistoryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [noteId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const questionText = (textToSend ?? inputValue).trim();
    if (!questionText || isLoading) return;

    setErrorMessage(null);
    setLastFailedQuestion(null);
    setInputValue('');

    const dbService = new DatabaseService();
    const chatService = new ChatMessageService(dbService);

    try {
      const savedUserMessage = await chatService.create(noteId, 'user', questionText);
      const currentConversation = [...messages, savedUserMessage];
      setMessages(currentConversation);
      setIsLoading(true);

      // Prepare bounded conversation history for API
      const historyPayload = currentConversation
        .slice(-MAX_HISTORY_FOR_API)
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      const client = new ApiClient();
      const response = await client.post<ChatApiResponse>('/api/chat', {
        noteContext: noteContent,
        question: questionText,
        conversationHistory: historyPayload,
        mode: selectedMode,
      });

      const savedAssistantMessage = await chatService.create(noteId, 'assistant', response.answer);
      setMessages((prev) => [...prev, savedAssistantMessage]);
    } catch (err: unknown) {
      console.error('Chat API invocation failed:', err);
      let desc = 'Unable to get AI response. Please try again.';
      if (err instanceof ApiError) {
        if (err.status === 429) {
          desc = 'Gemini API rate limit reached. Please wait a minute and retry.';
        } else if (err.message) {
          desc = err.message;
        }
      } else if (err instanceof Error) {
        desc = err.message;
      }
      setErrorMessage(desc);
      setLastFailedQuestion(questionText);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearHistory = async () => {
    const dbService = new DatabaseService();
    const chatService = new ChatMessageService(dbService);
    try {
      await chatService.deleteByNote(noteId);
      setMessages([]);
      setShowClearConfirm(false);
      setErrorMessage(null);
    } catch (err) {
      console.error('Failed to clear conversation history:', err);
    }
  };

  const handleRetry = () => {
    if (lastFailedQuestion) {
      handleSendMessage(lastFailedQuestion);
    }
  };

  const suggestionPrompts = [
    'Summarize the core takeaways of this note.',
    'Explain the most challenging concept simply.',
    'Quiz me on the main topics covered here.',
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '600px',
        maxHeight: 'calc(100vh - 12rem)',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-surface-border)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
      }}
      data-testid="chat-interface"
    >
      {/* Top Header / Mode Bar */}
      <div
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          borderBottom: '1px solid var(--color-surface-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-accent-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
            }}
          >
            💬
          </div>
          <div>
            <h2
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                margin: 0,
              }}
            >
              {noteTitle}
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              AI Study Assistant
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Mode Selector */}
          <div
            style={{
              display: 'inline-flex',
              padding: '0.2rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-surface-border)',
            }}
          >
            {(
              [
                { id: 'default', label: 'Default', icon: '🧠' },
                { id: 'explain', label: 'ELI5', icon: '🐣' },
                { id: 'quiz', label: 'Quiz Me', icon: '🎯' },
              ] as const
            ).map((mode) => {
              const isActive = selectedMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setSelectedMode(mode.id)}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    backgroundColor: isActive ? 'var(--color-primary)' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--color-text-secondary)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    transition: 'all var(--transition-fast)',
                  }}
                  data-testid={`mode-button-${mode.id}`}
                >
                  <span>{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          {/* Clear History Button */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              style={{
                padding: '0.35rem 0.65rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'transparent',
                border: '1px solid var(--color-surface-border)',
                color: 'var(--color-text-muted)',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
              title="Clear conversation history"
              data-testid="clear-history-button"
            >
              🗑️ Clear
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Clearing History */}
      {showClearConfirm && (
        <div
          style={{
            padding: '0.75rem 1.25rem',
            backgroundColor: 'var(--color-error-bg)',
            borderBottom: '1px solid var(--color-error)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
          data-testid="clear-confirm-banner"
        >
          <span style={{ fontSize: '0.85rem', color: 'var(--color-error)' }}>
            Are you sure you want to clear conversation history for this note?
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleClearHistory}
              style={{
                padding: '0.25rem 0.65rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-error)',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              data-testid="confirm-clear-btn"
            >
              Yes, Clear
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              style={{
                padding: '0.25rem 0.65rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-surface-border)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Scrollable Message Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
        data-testid="chat-messages-container"
      >
        {isHistoryLoading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--color-text-muted)',
              fontSize: '0.875rem',
            }}
          >
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              margin: 'auto',
              textAlign: 'center',
              maxWidth: '460px',
              padding: '2rem 1rem',
            }}
            data-testid="welcome-message"
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
                marginBottom: '1rem',
                border: '1px solid var(--color-primary-glow)',
              }}
            >
              ✨
            </div>
            <h3
              style={{
                fontSize: '1.15rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                margin: '0 0 0.5rem 0',
              }}
            >
              Ask me anything about this note!
            </h3>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
                margin: '0 0 1.5rem 0',
              }}
            >
              I will analyze your note content to answer questions, explain difficult concepts in
              simple terms, or quiz your understanding.
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                width: '100%',
              }}
            >
              {suggestionPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  style={{
                    padding: '0.625rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-secondary)',
                    fontSize: '0.8125rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                  data-testid="prompt-suggestion-chip"
                >
                  💡 {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          ))
        )}

        {/* Typing indicator */}
        {isLoading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              alignSelf: 'flex-start',
              margin: '0.5rem 0',
            }}
            data-testid="typing-indicator"
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--color-surface-raised)',
                border: '1px solid var(--color-surface-border)',
                fontSize: '1rem',
              }}
            >
              🤖
            </div>
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '1.25rem 1.25rem 1.25rem 0.25rem',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-primary)',
                  display: 'inline-block',
                  animation: 'pulse 1.4s infinite ease-in-out',
                }}
              />
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-accent)',
                  display: 'inline-block',
                  animation: 'pulse 1.4s infinite ease-in-out',
                  animationDelay: '0.2s',
                }}
              />
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-primary)',
                  display: 'inline-block',
                  animation: 'pulse 1.4s infinite ease-in-out',
                  animationDelay: '0.4s',
                }}
              />
            </div>
          </div>
        )}

        {/* Inline Error with Retry */}
        {errorMessage && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-error-bg)',
              border: '1px solid var(--color-error)',
              color: 'var(--color-error)',
              fontSize: '0.825rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              margin: '0.5rem 0',
            }}
            data-testid="chat-error-banner"
          >
            <span>⚠️ {errorMessage}</span>
            {lastFailedQuestion && (
              <button
                type="button"
                onClick={handleRetry}
                style={{
                  padding: '0.3rem 0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-error)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                data-testid="retry-chat-button"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid var(--color-surface-border)',
          backgroundColor: 'var(--color-bg-secondary)',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'flex-end',
        }}
      >
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about this note... (Enter to send, Shift+Enter for new line)"
          rows={1}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            color: 'var(--color-text-primary)',
            fontSize: '0.875rem',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.4,
            maxHeight: '120px',
          }}
          data-testid="chat-input-textarea"
        />

        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={isLoading || !inputValue.trim()}
          style={{
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            border: 'none',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: isLoading || !inputValue.trim() ? 'not-allowed' : 'pointer',
            opacity: isLoading || !inputValue.trim() ? 0.6 : 1,
            transition: 'all var(--transition-fast)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            height: '42px',
          }}
          data-testid="send-message-button"
        >
          <span>Send</span>
          <span>🚀</span>
        </button>
      </div>
    </div>
  );
}
