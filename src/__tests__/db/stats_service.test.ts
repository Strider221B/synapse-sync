import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_AI_MODEL } from '../../lib/api/ai_config';
import { DatabaseService } from '../../lib/db/database_service';
import { NoteService } from '../../lib/db/services/note_service';
import { NotebookService } from '../../lib/db/services/notebook_service';
import { QuizService } from '../../lib/db/services/quiz_service';
import { StatsService } from '../../lib/db/services/stats_service';

describe('StatsService', () => {
  it('returns zeroes when database stores are empty', async () => {
    const dbService = new DatabaseService('synapse-stats-empty-test');
    const statsService = new StatsService(dbService);

    const stats = await statsService.getDashboardStats();

    assert.equal(stats.notebooks, 0);
    assert.equal(stats.notes, 0);
    assert.equal(stats.quizzes, 0);
    assert.equal(stats.flashcards, 0);
    assert.equal(stats.srsCards, 0);
    assert.equal(stats.cardsDueToday, 0);
    assert.equal(stats.totalReviewsCompleted, 0);
    assert.equal(stats.masteredCards, 0);

    await dbService.close();
  });

  it('aggregates counts correctly across populated stores', async () => {
    const dbService = new DatabaseService('synapse-stats-populated-test');
    const notebookService = new NotebookService(dbService);
    const noteService = new NoteService(dbService);
    const quizService = new QuizService(dbService);
    const statsService = new StatsService(dbService);

    // 1. Create a notebook
    const notebook = await notebookService.create({
      name: 'Biology 101',
      source: 'manual',
      tags: ['science', 'biology'],
    });

    // 2. Create two notes
    const note1 = await noteService.create({
      notebookId: notebook.id,
      title: 'Cellular Respiration',
      sourceType: 'manual',
      content: '# Cellular Respiration',
      contentFormat: 'markdown',
    });

    await noteService.create({
      notebookId: notebook.id,
      title: 'Photosynthesis',
      sourceType: 'manual',
      content: '# Photosynthesis',
      contentFormat: 'markdown',
    });

    // 3. Create a quiz with flashcards and MCQ cards
    await quizService.create(
      note1.id,
      [
        {
          question: 'What is the powerhouse of the cell?',
          options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi'],
          correctIndex: 1,
          explanation: 'Mitochondria generate most ATP.',
        },
      ],
      [
        { front: 'What is ATP?', back: 'Adenosine Triphosphate', tags: ['bio'] },
        { front: 'Where does glycolysis occur?', back: 'Cytoplasm', tags: ['bio'] },
      ],
      DEFAULT_AI_MODEL
    );

    const stats = await statsService.getDashboardStats();

    assert.equal(stats.notebooks, 1);
    assert.equal(stats.notes, 2);
    assert.equal(stats.quizzes, 1);
    assert.equal(stats.flashcards, 2);
    assert.equal(stats.srsCards, 3); // 2 flashcards + 1 MCQ
    assert.equal(stats.cardsDueToday, 3); // Initial nextReview is now or earlier

    // 4. Test unauthenticated stats returns all zeroes
    const unauthStats = await statsService.getDashboardStats(false);
    assert.equal(unauthStats.notebooks, 0);
    assert.equal(unauthStats.notes, 0);
    assert.equal(unauthStats.cardsDueToday, 0);
    assert.equal(unauthStats.studyStreakDays, 0);
    assert.equal(unauthStats.studyStreakYesterday, 0);

    await dbService.close();
  });
});
