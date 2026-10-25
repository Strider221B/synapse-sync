import type { Flashcard, MCQCard, Note } from '../db/models';

/**
 * Service for formatting study items and copying them to system clipboard.
 */
export class ClipboardService {
  private static readonly _OPTION_LETTERS = ['A', 'B', 'C', 'D'];
  private static readonly _FALLBACK_LEFT = '-9999px';
  private static readonly _FALLBACK_TOP = '-9999px';

  /**
   * Copies formatted text to the user's system clipboard with browser fallback.
   */
  public async copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return this._fallbackCopy(text);
      }
    }
    return this._fallbackCopy(text);
  }

  /**
   * Formats a single Multiple Choice Question card for clipboard export.
   */
  public formatMCQ(card: MCQCard): string {
    const formattedOptions = card.options
      .map((option, index) => `${ClipboardService._OPTION_LETTERS[index] ?? index + 1}. ${option}`)
      .join('\n');

    const correctLabel = ClipboardService._OPTION_LETTERS[card.correctIndex] ?? `${card.correctIndex + 1}`;
    const correctText = card.options[card.correctIndex] ?? '';

    return [
      `Question: ${card.question}`,
      '',
      formattedOptions,
      '',
      `Correct Answer: ${correctLabel}. ${correctText}`,
      '',
      `Explanation:`,
      card.explanation,
    ].join('\n');
  }

  /**
   * Formats a single Flashcard for clipboard export.
   */
  public formatFlashcard(card: Flashcard): string {
    return [
      'Question:',
      card.front,
      '',
      'Answer:',
      card.back,
    ].join('\n');
  }

  /**
   * Formats an open note (title and full content) for clipboard export.
   */
  public formatNote(note: Note): string {
    return `# ${note.title}\n\n${note.content}`;
  }

  /**
   * Formats an entire quiz with multiple MCQ questions for clipboard export.
   */
  public formatQuizMCQs(cards: MCQCard[], title?: string): string {
    const header = title ? `# Quiz: ${title}\n\n` : '';
    const body = cards.map((card, index) => `--- Question ${index + 1} ---\n${this.formatMCQ(card)}`).join('\n\n');
    return `${header}${body}`;
  }

  /**
   * Fallback copy using temporary DOM textarea.
   */
  private _fallbackCopy(text: string): boolean {
    if (typeof document === 'undefined') {
      return false;
    }
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = ClipboardService._FALLBACK_LEFT;
      textArea.style.top = ClipboardService._FALLBACK_TOP;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch {
      return false;
    }
  }
}
