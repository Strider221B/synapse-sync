/**
 * Database constants for SynapseSync IndexedDB.
 */
export const DB_NAME = 'synapse-sync';
export const DB_VERSION = 1;

export const DB_STORES = {
  NOTEBOOKS: 'notebooks',
  NOTES: 'notes',
  QUIZZES: 'quizzes',
  MCQ_CARDS: 'mcq_cards',
  FLASHCARDS: 'flashcards',
  SRS_CARDS: 'srs_cards',
  CHAT_MESSAGES: 'chat_messages',
  SYNC_QUEUE: 'sync_queue',
  PREFERENCES: 'preferences',
} as const;

export const DB_INDEXES = {
  BY_SOURCE: 'by-source',
  BY_UPDATED: 'by-updated',
  BY_NOTEBOOK: 'by-notebook',
  BY_SOURCE_TYPE: 'by-source-type',
  BY_TITLE: 'by-title',
  BY_NOTE: 'by-note',
  BY_GENERATED: 'by-generated',
  BY_QUIZ: 'by-quiz',
  BY_CARD: 'by-card',
  BY_NEXT_REVIEW: 'by-next-review',
  BY_CARD_TYPE: 'by-card-type',
  BY_TIMESTAMP: 'by-timestamp',
  BY_STATUS: 'by-status',
  BY_ENTITY: 'by-entity',
  BY_CREATED: 'by-created',
} as const;
