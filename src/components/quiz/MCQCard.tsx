'use client';

import React, { useState } from 'react';
import type { MCQCard as MCQCardType } from '@/lib/db/models';
import { ClipboardService } from '@/lib/utils/clipboard_service';

export interface MCQCardProps {
  card: MCQCardType;
  questionIndex: number;
  totalQuestions: number;
  selectedOption: number | null;
  onSelectOption: (optionIndex: number) => void;
  onDelete?: () => void;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export const MCQCard: React.FC<MCQCardProps> = ({
  card,
  questionIndex,
  totalQuestions,
  selectedOption,
  onSelectOption,
  onDelete,
}) => {
  const [copied, setCopied] = useState(false);
  const isAnswered = selectedOption !== null;
  const isCorrect = selectedOption === card.correctIndex;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const clipboardService = new ClipboardService();
    const formatted = clipboardService.formatMCQ(card);
    const success = await clipboardService.copyToClipboard(formatted);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getOptionStyle = (index: number): React.CSSProperties => {
    const isSelected = selectedOption === index;
    const isTargetCorrect = index === card.correctIndex;

    const baseStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '1rem 1.25rem',
      borderRadius: 'var(--radius-md)',
      border: '1.5px solid var(--color-surface-border)',
      backgroundColor: 'var(--color-surface)',
      color: 'var(--color-text-primary)',
      fontSize: '0.95rem',
      fontWeight: 500,
      textAlign: 'left',
      cursor: isAnswered ? 'default' : 'pointer',
      transition: 'all var(--transition-fast)',
      width: '100%',
    };

    if (!isAnswered) {
      return baseStyle;
    }

    if (isTargetCorrect) {
      return {
        ...baseStyle,
        backgroundColor: 'var(--color-success-bg)',
        borderColor: 'var(--color-success)',
        color: 'var(--color-text-primary)',
        boxShadow: '0 0 12px rgba(16, 185, 129, 0.2)',
      };
    }

    if (isSelected && !isTargetCorrect) {
      return {
        ...baseStyle,
        backgroundColor: 'var(--color-error-bg)',
        borderColor: 'var(--color-error)',
        color: 'var(--color-text-primary)',
      };
    }

    return {
      ...baseStyle,
      opacity: 0.45,
    };
  };

  const getBadgeStyle = (index: number): React.CSSProperties => {
    const isSelected = selectedOption === index;
    const isTargetCorrect = index === card.correctIndex;

    let bg = 'var(--color-surface-raised)';
    let text = 'var(--color-text-secondary)';
    let border = 'var(--color-surface-border)';

    if (isAnswered) {
      if (isTargetCorrect) {
        bg = 'var(--color-success)';
        text = '#ffffff';
        border = 'transparent';
      } else if (isSelected) {
        bg = 'var(--color-error)';
        text = '#ffffff';
        border = 'transparent';
      }
    }

    return {
      width: '32px',
      height: '32px',
      borderRadius: 'var(--radius-sm)',
      backgroundColor: bg,
      color: text,
      border: `1px solid ${border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: '0.85rem',
      flexShrink: 0,
      transition: 'all var(--transition-fast)',
    };
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '2rem',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {/* Header with question index */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '0.85rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        <span>
          Question {questionIndex + 1} of {totalQuestions}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {isAnswered && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: isCorrect ? 'var(--color-success)' : 'var(--color-error)',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              {isCorrect ? '✓ Correct' : '✕ Incorrect'}
            </span>
          )}

          <button
            type="button"
            onClick={handleCopy}
            title="Copy question, options, correct answer and explanation to clipboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.3rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: copied ? 'var(--color-success-bg)' : 'var(--color-surface-raised)',
              border: `1px solid ${copied ? 'var(--color-success)' : 'var(--color-surface-border)'}`,
              color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            <span>{copied ? '✓' : '📋'}</span>
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Delete this question"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.3rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'transparent',
                border: '1px solid var(--color-surface-border)',
                color: 'var(--color-error)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <span>🗑️</span>
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Question prompt */}
      <h3
        style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          lineHeight: 1.5,
          color: 'var(--color-text-primary)',
          margin: 0,
        }}
      >
        {card.question}
      </h3>

      {/* Options grid / list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {card.options.map((option, idx) => (
          <button
            key={idx}
            type="button"
            disabled={isAnswered}
            onClick={() => onSelectOption(idx)}
            style={getOptionStyle(idx)}
          >
            <span style={getBadgeStyle(idx)}>{OPTION_LABELS[idx] ?? idx + 1}</span>
            <span style={{ flex: 1 }}>{option}</span>
          </button>
        ))}
      </div>

      {/* Explanation drawer */}
      {isAnswered && (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: isCorrect ? 'var(--color-success-bg)' : 'var(--color-surface-raised)',
            borderLeft: `4px solid ${isCorrect ? 'var(--color-success)' : 'var(--color-primary)'}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            animation: 'fadeIn 0.3s ease-in-out',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: '0.85rem',
              color: isCorrect ? 'var(--color-success)' : 'var(--color-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            💡 Explanation
          </div>
          <p
            style={{
              margin: 0,
              fontSize: '0.9rem',
              lineHeight: 1.6,
              color: 'var(--color-text-secondary)',
            }}
          >
            {card.explanation}
          </p>
        </div>
      )}
    </div>
  );
};
