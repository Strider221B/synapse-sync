import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DatabaseService } from '../../lib/db/database_service';
import { QuizService } from '../../lib/db/services/quiz_service';
import {
  ParsedQuizImport,
  QuizImportExportService,
} from '../../lib/services/quiz_import_export_service';

describe('QuizImportExportService', () => {
  const service = new QuizImportExportService();
  const sampleText =
    'Photosynthesis is the process used by plants and other organisms to convert light energy into chemical energy that can later be released to fuel the organisms activities. This chemical energy is stored in carbohydrate molecules, such as sugars and starches, which are synthesized from carbon dioxide and water.';

  it('throws error when exporting text with fewer than 50 characters', () => {
    assert.throws(
      () =>
        service.exportPrompts({
          noteId: 'n1',
          noteTitle: 'Short Note',
          noteContent: 'Too short text',
        }),
      /at least 50 characters required/
    );
  });

  it('exports single chunk prompt with instructions and output schema', () => {
    const bundle = service.exportPrompts({
      noteId: 'note-101',
      noteTitle: 'Plant Biology',
      noteContent: sampleText,
      difficulty: 'hard',
      mcqCount: 5,
      flashcardCount: 5,
    });

    assert.equal(bundle.noteId, 'note-101');
    assert.equal(bundle.noteTitle, 'Plant Biology');
    assert.equal(bundle.totalChunks, 1);
    assert.equal(bundle.difficulty, 'hard');
    assert.equal(bundle.chunks.length, 1);
    const chunk = bundle.chunks[0];
    assert.equal(chunk.chunkIndex, 1);
    assert.ok(chunk.prompt.includes('Rules for Multiple Choice Questions (MCQs):'));
    assert.ok(chunk.prompt.includes('Difficulty: hard'));
    assert.ok(chunk.prompt.includes('Photosynthesis'));
  });

  it('exports multiple chunk prompts when content exceeds chunkWords', () => {
    const repeated = Array(300).fill('biology cell gene evolution organism ecosystem').join(' ');
    const bundle = service.exportPrompts({
      noteId: 'note-102',
      noteTitle: 'Comprehensive Biology',
      noteContent: repeated,
      chunkWords: 100,
    });

    assert.ok(bundle.totalChunks > 1);
    assert.equal(bundle.chunks.length, bundle.totalChunks);
    assert.ok(bundle.chunks[0].prompt.includes(`Part 1 of ${bundle.totalChunks}`));
    assert.ok(bundle.chunks[1].prompt.includes(`Part 2 of ${bundle.totalChunks}`));
  });

  it('incorporates past context to prevent duplicates and repeats', () => {
    const bundle = service.exportPrompts({
      noteId: 'note-103',
      noteTitle: 'Plant Biology',
      noteContent: sampleText,
      previousQuestions: ['What is the role of chlorophyll?', 'How is ATP formed?'],
      previousFlashcards: ['What is the chemical formula for glucose?'],
    });

    assert.equal(bundle.previousContextCount, 3);
    const chunkPrompt = bundle.chunks[0].prompt;
    assert.ok(chunkPrompt.includes('Previous Questions and Flashcards to AVOID'));
    assert.ok(chunkPrompt.includes('What is the role of chlorophyll?'));
    assert.ok(chunkPrompt.includes('What is the chemical formula for glucose?'));
    assert.ok(chunkPrompt.includes('Ensure all newly generated questions and flashcards explore DIFFERENT concepts'));
  });

  it('formats export bundle as markdown document', () => {
    const bundle = service.exportPrompts({
      noteId: 'note-104',
      noteTitle: 'Cellular Respiration',
      noteContent: sampleText,
    });
    const markdown = service.formatExportAsMarkdown(bundle);
    assert.ok(markdown.includes('# Quiz Generation Prompts for "Cellular Respiration"'));
    assert.ok(markdown.includes('## Chunk 1 of 1'));
    assert.ok(markdown.includes('## Expected Output Schema'));
  });

  it('parses pure JSON import string', () => {
    const payload = JSON.stringify({
      mcqs: [
        {
          question: 'What is the main pigment used in photosynthesis?',
          options: ['Chlorophyll', 'Carotenoid', 'Anthocyanin', 'Melanin'],
          correctIndex: 0,
          explanation: 'Chlorophyll absorbs light primarily in blue and red wavelengths.',
        },
      ],
      flashcards: [
        {
          front: 'Where does photosynthesis occur in eukaryotes?',
          back: 'Chloroplasts',
        },
      ],
    });

    const parsed = service.parseImportText(payload);
    assert.equal(parsed.mcqs.length, 1);
    assert.equal(parsed.flashcards.length, 1);
    assert.equal(parsed.mcqs[0].correctIndex, 0);
    assert.equal(parsed.flashcards[0].front, 'Where does photosynthesis occur in eukaryotes?');
  });

  it('parses JSON wrapped in markdown code fences and conversational preamble', () => {
    const fenced = `Here is your generated quiz based on the notes:
\`\`\`json
{
  "mcqs": [
    {
      "question": "Which organelle synthesizes ATP?",
      "options": ["Mitochondria", "Ribosome", "Golgi apparatus", "Lysosome"],
      "correctIndex": 0,
      "explanation": "Mitochondria are the powerhouse of the cell."
    }
  ],
  "flashcards": [
    {
      "front": "What does ATP stand for?",
      "back": "Adenosine triphosphate"
    }
  ]
}
\`\`\`
I hope this helps your studies!`;

    const parsed = service.parseImportText(fenced);
    assert.equal(parsed.mcqs.length, 1);
    assert.equal(parsed.flashcards.length, 1);
    assert.equal(parsed.mcqs[0].question, 'Which organelle synthesizes ATP?');
  });

  it('parses array of chunk results combined together', () => {
    const chunkArray = JSON.stringify([
      {
        mcqs: [
          {
            question: 'Question 1',
            options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
            correctIndex: 1,
            explanation: 'Exp 1',
          },
        ],
        flashcards: [],
      },
      {
        mcqs: [],
        flashcards: [{ front: 'Front 2', back: 'Back 2' }],
      },
    ]);

    const parsed = service.parseImportText(chunkArray);
    assert.equal(parsed.mcqs.length, 1);
    assert.equal(parsed.flashcards.length, 1);
  });

  it('throws error when JSON syntax is corrupted', () => {
    assert.throws(() => service.parseImportText('{ invalid json here'), /Failed to parse JSON input/);
  });

  it('throws error when no valid MCQs or flashcards exist in data', () => {
    assert.throws(
      () => service.validateImportData({ someRandomField: 123 }),
      /No valid MCQs or flashcards found/
    );
  });

  it('throws validation error on malformed MCQ card', () => {
    assert.throws(
      () =>
        service.validateImportData({
          mcqs: [
            {
              question: '',
              options: ['A', 'B', 'C', 'D'],
              correctIndex: 0,
            },
          ],
        }),
      /question must be a non-empty string/
    );

    assert.throws(
      () =>
        service.validateImportData({
          mcqs: [
            {
              question: 'Valid Q?',
              options: ['Only one option'],
              correctIndex: 0,
            },
          ],
        }),
      /options must contain exactly 4 choices/
    );

    assert.throws(
      () =>
        service.validateImportData({
          mcqs: [
            {
              question: 'Valid Q?',
              options: ['A', 'B', 'C', 'D'],
              correctIndex: 5,
            },
          ],
        }),
      /correctIndex is out of range/
    );
  });

  it('throws validation error on malformed flashcard', () => {
    assert.throws(
      () =>
        service.validateImportData({
          flashcards: [{ front: '', back: 'Back answer' }],
        }),
      /front and back must be non-empty strings/
    );
  });

  it('integrates with QuizService to persist quiz, cards, and SRS records', async () => {
    const testDb = new DatabaseService('synapse-import-export-test');
    const quizService = new QuizService(testDb);

    const parsedData: ParsedQuizImport = {
      mcqs: [
        {
          question: 'What is the powerhouse of the cell?',
          options: ['Mitochondria', 'Nucleus', 'Vacuole', 'Endoplasmic Reticulum'],
          correctIndex: 0,
          explanation: 'Mitochondria generate most ATP.',
        },
      ],
      flashcards: [
        {
          front: 'What organelle contains genetic material?',
          back: 'Nucleus',
          tags: ['Cell Biology'],
        },
      ],
    };

    const result = await service.importQuiz('note-999', 'Cell Biology', parsedData, quizService);

    assert.ok(result.quiz.id);
    assert.equal(result.quiz.noteId, 'note-999');
    assert.equal(result.quiz.modelUsed, 'manual-import');
    assert.equal(result.quiz.version, 1);
    assert.equal(result.mcqCards.length, 1);
    assert.equal(result.flashcards.length, 1);
    assert.equal(result.flashcards[0].tags[0], 'Cell Biology');

    const loaded = await quizService.getQuizWithCards(result.quiz.id);
    assert.ok(loaded);
    assert.equal(loaded?.mcqCards.length, 1);
    assert.equal(loaded?.flashcards.length, 1);
  });
});
