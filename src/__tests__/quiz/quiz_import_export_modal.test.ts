import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import type { Note } from '@/lib/db/models';
import { QuizImportExportModal } from '@/components/quiz/QuizImportExportModal';

describe('QuizImportExportModal Component', () => {
  const mockNote: Note = {
    id: 'note-modal-test',
    notebookId: 'nb-1',
    title: 'Cellular Respiration and Glycolysis',
    content:
      'Glycolysis is the metabolic pathway that converts glucose into pyruvate, and in the process releases free energy which forms ATP and reduced NADH. The process requires ten enzyme-catalyzed steps and occurs in the cytoplasm of cells.',
    contentFormat: 'markdown',
    sourceType: 'manual',
    wordCount: 35,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };

  it('renders null when isOpen is false', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(
      React.createElement(QuizImportExportModal, {
        isOpen: false,
        onClose: () => {},
        note: mockNote,
        onImportSuccess: () => {},
      })
    );
    assert.equal(html, '');
  });

  it('renders modal dialog and export prompts tab when isOpen is true', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(
      React.createElement(QuizImportExportModal, {
        isOpen: true,
        onClose: () => {},
        note: mockNote,
        existingQuestions: ['Past question on Krebs cycle?'],
        existingFlashcards: ['What is the end product of glycolysis?'],
        onImportSuccess: () => {},
      })
    );

    assert.ok(html.includes('Offline Quiz: Export Prompts &amp; Import') || html.includes('Offline Quiz: Export Prompts & Import'));
    assert.ok(html.includes('Cellular Respiration and Glycolysis'));
    assert.ok(html.includes('Export Chunk Prompts'));
    assert.ok(html.includes('Import Generated Quiz'));
    assert.ok(html.includes('Rules for Multiple Choice Questions (MCQs):'));
    assert.ok(html.includes('Past question on Krebs cycle?'));
    assert.ok(html.includes('Copy Prompt'));
    assert.ok(html.includes('Download JSON'));
    assert.ok(html.includes('Download MD'));
  });

  it('renders multiple chunk selectors when document exceeds chunk size', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const longContent = Array(600).fill('biology enzyme reaction energy molecule metabolism').join(' ');
    const longNote: Note = {
      ...mockNote,
      content: longContent,
    };

    const html = renderToStaticMarkup(
      React.createElement(QuizImportExportModal, {
        isOpen: true,
        onClose: () => {},
        note: longNote,
        onImportSuccess: () => {},
      })
    );

    assert.ok(html.includes('Chunk 1'));
    assert.ok(html.includes('Chunk 2'));
    assert.ok(html.includes('Chunks:'));
  });
});
