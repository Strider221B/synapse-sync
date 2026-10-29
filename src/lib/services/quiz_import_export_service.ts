import type { CreateFlashcardInput, CreateMCQInput, QuizService, QuizWithCards } from '../db/services/quiz_service';

export interface QuizExportChunk {
  chunkIndex: number;
  totalChunks: number;
  wordCount: number;
  text: string;
  prompt: string;
  expectedFormat: Record<string, unknown>;
}

export interface QuizExportBundle {
  noteId: string;
  noteTitle: string;
  totalChunks: number;
  chunkWords: number;
  difficulty: string;
  mcqCount: number;
  flashcardCount: number;
  previousContextCount: number;
  chunks: QuizExportChunk[];
  outputSchema: Record<string, unknown>;
  exportedAt: string;
}

export interface QuizExportParams {
  noteId: string;
  noteTitle: string;
  noteContent: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  mcqCount?: number;
  flashcardCount?: number;
  chunkWords?: number;
  previousQuestions?: string[];
  previousFlashcards?: string[];
}

export interface ParsedQuizImport {
  mcqs: CreateMCQInput[];
  flashcards: CreateFlashcardInput[];
}

interface RawChunkPayload {
  mcqs?: unknown[];
  flashcards?: unknown[];
}

/**
 * Service managing quiz prompt chunk export and offline quiz payload import/validation.
 */
export class QuizImportExportService {
  private static readonly _DEFAULT_CHUNK_WORDS = 2500;
  private static readonly _DEFAULT_DIFFICULTY = 'medium';
  private static readonly _DEFAULT_MCQ_COUNT = 5;
  private static readonly _DEFAULT_FLASHCARD_COUNT = 5;
  private static readonly _REQUIRED_OPTIONS_COUNT = 4;
  private static readonly _MAX_CONTEXT_ITEMS = 30;
  private static readonly _MIN_TEXT_LENGTH = 50;
  private static readonly _DEFAULT_MODEL_USED = 'manual-import';

  private static readonly _ERR_EMPTY_TEXT =
    'Note content is too short to export quiz prompts (at least 50 characters required).';
  private static readonly _ERR_INVALID_JSON = 'Failed to parse JSON input. Please verify the syntax.';
  private static readonly _ERR_NO_ITEMS = 'No valid MCQs or flashcards found in the imported data.';
  private static readonly _ERR_INVALID_MCQ_QUESTION = 'Invalid MCQ: question must be a non-empty string.';
  private static readonly _ERR_INVALID_MCQ_OPTIONS = 'Invalid MCQ: options must contain exactly 4 choices.';
  private static readonly _ERR_INVALID_MCQ_INDEX = 'Invalid MCQ: correctIndex is out of range or not an integer.';
  private static readonly _ERR_INVALID_FLASHCARD = 'Invalid Flashcard: front and back must be non-empty strings.';
  private static readonly _DEFAULT_EXPLANATION = 'Correct answer based on the note text.';

  private static readonly _SCHEMA_DEFINITION: Record<string, unknown> = {
    type: 'object',
    properties: {
      mcqs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            correctIndex: { type: 'integer' },
            explanation: { type: 'string' },
          },
          required: ['question', 'options', 'correctIndex', 'explanation'],
        },
      },
      flashcards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            front: { type: 'string' },
            back: { type: 'string' },
          },
          required: ['front', 'back'],
        },
      },
    },
    required: ['mcqs', 'flashcards'],
  };

  public constructor() {}

  /**
   * Generates chunked prompts with past context avoidance and expected JSON schema.
   */
  public exportPrompts(params: QuizExportParams): QuizExportBundle {
    const text = params.noteContent.trim();
    if (text.length < QuizImportExportService._MIN_TEXT_LENGTH) {
      throw new Error(QuizImportExportService._ERR_EMPTY_TEXT);
    }
    const words = text.split(/\s+/).filter(Boolean);
    const chunkWords = params.chunkWords ?? QuizImportExportService._DEFAULT_CHUNK_WORDS;
    const diff = params.difficulty ?? QuizImportExportService._DEFAULT_DIFFICULTY;
    const mcqCount = params.mcqCount ?? QuizImportExportService._DEFAULT_MCQ_COUNT;
    const flashcardCount = params.flashcardCount ?? QuizImportExportService._DEFAULT_FLASHCARD_COUNT;
    const wordSlices = this._chunkWords(words, chunkWords);
    const pastQuestions = params.previousQuestions ?? [];
    const pastFlashcards = params.previousFlashcards ?? [];
    const pastContextBlock = this._formatPreviousContext(pastQuestions, pastFlashcards);
    const chunks = this._buildExportChunks(wordSlices, diff, mcqCount, flashcardCount, pastContextBlock);

    return {
      noteId: params.noteId,
      noteTitle: params.noteTitle,
      totalChunks: chunks.length,
      chunkWords,
      difficulty: diff,
      mcqCount,
      flashcardCount,
      previousContextCount: pastQuestions.length + pastFlashcards.length,
      chunks,
      outputSchema: QuizImportExportService._SCHEMA_DEFINITION,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Formats the export bundle into a human-readable markdown document.
   */
  public formatExportAsMarkdown(bundle: QuizExportBundle): string {
    const lines: string[] = [
      `# Quiz Generation Prompts for "${bundle.noteTitle}"`,
      '',
      '> Generated by SynapseSync for offline / manual LLM quiz generation.',
      `> Total Chunks: ${bundle.totalChunks} | Excluded Past Items: ${bundle.previousContextCount}`,
      '',
    ];
    for (const chunk of bundle.chunks) {
      lines.push(`## Chunk ${chunk.chunkIndex} of ${chunk.totalChunks} (${chunk.wordCount} words)`);
      lines.push('');
      lines.push('```markdown');
      lines.push(chunk.prompt);
      lines.push('```');
      lines.push('');
    }
    lines.push('## Expected Output Schema');
    lines.push('```json');
    lines.push(JSON.stringify(bundle.outputSchema, null, 2));
    lines.push('```');
    return lines.join('\n');
  }

  /**
   * Parses raw imported text (JSON or markdown fenced) into validated MCQs and flashcards.
   */
  public parseImportText(rawText: string): ParsedQuizImport {
    const cleaned = this._extractJsonString(rawText);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(QuizImportExportService._ERR_INVALID_JSON);
    }
    return this.validateImportData(parsed);
  }

  /**
   * Validates an arbitrary parsed JSON structure against the expected quiz schema.
   */
  public validateImportData(data: unknown): ParsedQuizImport {
    if (!data || (typeof data !== 'object' && !Array.isArray(data))) {
      throw new Error(QuizImportExportService._ERR_NO_ITEMS);
    }
    const rawItems = this._flattenImportData(data);
    const mcqs: CreateMCQInput[] = [];
    const flashcards: CreateFlashcardInput[] = [];
    for (const item of rawItems) {
      if (item.mcqs && Array.isArray(item.mcqs)) {
        for (const rawMcq of item.mcqs) mcqs.push(this._validateMCQCard(rawMcq));
      }
      if (item.flashcards && Array.isArray(item.flashcards)) {
        for (const rawFlash of item.flashcards) flashcards.push(this._validateFlashcard(rawFlash));
      }
    }
    if (mcqs.length === 0 && flashcards.length === 0) {
      throw new Error(QuizImportExportService._ERR_NO_ITEMS);
    }
    return { mcqs, flashcards };
  }

  /**
   * Saves validated quiz items to IndexedDB via QuizService and returns the created Quiz bundle.
   */
  public async importQuiz(
    noteId: string,
    noteTitle: string,
    parsedData: ParsedQuizImport,
    quizService: QuizService,
    modelUsed: string = QuizImportExportService._DEFAULT_MODEL_USED
  ): Promise<QuizWithCards> {
    const formattedMCQs = parsedData.mcqs.map((q) => ({
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation || QuizImportExportService._DEFAULT_EXPLANATION,
    }));
    const formattedFlashcards = parsedData.flashcards.map((f) => ({
      front: f.front,
      back: f.back,
      tags: f.tags && f.tags.length > 0 ? f.tags : [noteTitle],
    }));
    return quizService.create(noteId, formattedMCQs, formattedFlashcards, modelUsed);
  }

  protected _chunkWords(words: string[], chunkSize: number): string[][] {
    const chunks: string[][] = [];
    for (let idx = 0; idx < words.length; idx += chunkSize) {
      chunks.push(words.slice(idx, idx + chunkSize));
    }
    return chunks.length > 0 ? chunks : [[]];
  }

  protected _buildExportChunks(
    wordSlices: string[][],
    diff: string,
    mcqCount: number,
    flashcardCount: number,
    pastContextBlock: string
  ): QuizExportChunk[] {
    const total = wordSlices.length;
    return wordSlices.map((slice, idx) => {
      const partInfo = total > 1 ? ` (Part ${idx + 1} of ${total})` : '';
      const chunkText = slice.join(' ');
      const prompt = this._buildPromptText(chunkText, diff, mcqCount, flashcardCount, partInfo, pastContextBlock);
      return {
        chunkIndex: idx + 1,
        totalChunks: total,
        wordCount: slice.length,
        text: chunkText,
        prompt,
        expectedFormat: QuizImportExportService._SCHEMA_DEFINITION,
      };
    });
  }

  protected _buildPromptText(
    text: string,
    diff: string,
    mcqs: number,
    flashcards: number,
    partInfo: string,
    pastContextBlock: string
  ): string {
    const header = [
      'You are an expert educational content creator. Generate quiz questions and flashcards that test deep understanding and practical application, not just surface-level recall.',
      '',
      'Rules for Multiple Choice Questions (MCQs):',
      '- EVERY MCQ question MUST be scenario-based: present a concrete, realistic real-life scenario or case study where the concept would be useful or applied in practice.',
      '- Make the MCQs tricky: design plausible, tricky distractors that target subtle misconceptions, edge cases, and common pitfalls. Avoid simple or obvious choices.',
      '- Each MCQ must have exactly 4 options with one unambiguously correct answer.',
      '- Explanations must clearly justify why the correct option is the best choice in that scenario and explain why the tricky distractors are incorrect, referencing specific concepts from the text.',
      '',
      'Rules for Flashcards:',
      '- Flashcard fronts should be open-ended questions that require active recall',
      '- Flashcard backs should be concise but complete answers',
      '',
      'General Rules:',
      '- All content must be based STRICTLY on the provided text — do not add external knowledge',
      `- Difficulty: ${diff}`,
    ].join('\n');

    const instruction = `Generate exactly ${mcqs} scenario-based tricky multiple-choice questions and ${flashcards} active recall flashcards based strictly on the following text${partInfo}:\n\n---\n${text}\n---`;
    const formatReq = `Return ONLY a valid JSON object matching the following structure:\n{\n  "mcqs": [\n    {\n      "question": "Scenario question...",\n      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],\n      "correctIndex": 0,\n      "explanation": "Why option 1 is correct..."\n    }\n  ],\n  "flashcards": [\n    {\n      "front": "Active recall prompt...",\n      "back": "Concise answer..."\n    }\n  ]\n}`;
    if (pastContextBlock) {
      return `${header}\n\n${pastContextBlock}\n\n${instruction}\n\n${formatReq}`;
    }
    return `${header}\n\n${instruction}\n\n${formatReq}`;
  }

  protected _formatPreviousContext(questions: string[], flashcards: string[]): string {
    const allItems = [...questions, ...flashcards]
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, QuizImportExportService._MAX_CONTEXT_ITEMS);
    if (allItems.length === 0) return '';
    const lines = [
      'Previous Questions and Flashcards to AVOID (Do NOT duplicate, repeat, or rephrase these):',
    ];
    for (const item of allItems) {
      lines.push(`- ${item}`);
    }
    lines.push(
      'Ensure all newly generated questions and flashcards explore DIFFERENT concepts, different real-life scenarios, and different aspects of the text.'
    );
    return lines.join('\n');
  }

  protected _extractJsonString(rawText: string): string {
    const trimmed = rawText.trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      return fenceMatch[1].trim();
    }
    const firstObj = trimmed.indexOf('{');
    const firstArr = trimmed.indexOf('[');
    const startIdx = firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
    const lastObj = trimmed.lastIndexOf('}');
    const lastArr = trimmed.lastIndexOf(']');
    const endIdx = Math.max(lastObj, lastArr);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      return trimmed.slice(startIdx, endIdx + 1).trim();
    }
    return trimmed;
  }

  protected _flattenImportData(data: unknown): RawChunkPayload[] {
    if (Array.isArray(data)) {
      return data as RawChunkPayload[];
    }
    if (typeof data === 'object' && data !== null) {
      const record = data as Record<string, unknown>;
      if (Array.isArray(record.chunks)) {
        return record.chunks as RawChunkPayload[];
      }
      return [record as RawChunkPayload];
    }
    return [];
  }

  protected _validateMCQCard(item: unknown): CreateMCQInput {
    if (!item || typeof item !== 'object') throw new Error(QuizImportExportService._ERR_INVALID_MCQ_QUESTION);
    const rec = item as Record<string, unknown>;
    const question = String(rec.question || '').trim();
    if (!question) throw new Error(QuizImportExportService._ERR_INVALID_MCQ_QUESTION);
    if (!Array.isArray(rec.options) || rec.options.length !== QuizImportExportService._REQUIRED_OPTIONS_COUNT) {
      throw new Error(QuizImportExportService._ERR_INVALID_MCQ_OPTIONS);
    }
    const options: [string, string, string, string] = [
      String(rec.options[0] || '').trim(),
      String(rec.options[1] || '').trim(),
      String(rec.options[2] || '').trim(),
      String(rec.options[3] || '').trim(),
    ];
    const correctIndex = Number(rec.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      throw new Error(QuizImportExportService._ERR_INVALID_MCQ_INDEX);
    }
    const explanation = String(rec.explanation || '').trim() || QuizImportExportService._DEFAULT_EXPLANATION;
    return { question, options, correctIndex, explanation };
  }

  protected _validateFlashcard(item: unknown): CreateFlashcardInput {
    if (!item || typeof item !== 'object') throw new Error(QuizImportExportService._ERR_INVALID_FLASHCARD);
    const rec = item as Record<string, unknown>;
    const front = String(rec.front || '').trim();
    const back = String(rec.back || '').trim();
    if (!front || !back) throw new Error(QuizImportExportService._ERR_INVALID_FLASHCARD);
    const tags = Array.isArray(rec.tags) ? rec.tags.map((t) => String(t).trim()).filter(Boolean) : [];
    return { front, back, tags };
  }
}
