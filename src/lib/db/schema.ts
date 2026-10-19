import type { DBSchema } from 'idb';
import type {
  ChatMessage,
  Flashcard,
  MCQCard,
  Notebook,
  Note,
  Quiz,
  SRSCard,
  SyncEntry,
  UserPreference,
} from './models';

/**
 * IndexedDB Schema definition for SynapseSync.
 */
export interface SynapseSyncDB extends DBSchema {
  notebooks: {
    key: string;
    value: Notebook;
    indexes: {
      'by-source': string;
      'by-updated': string;
    };
  };
  notes: {
    key: string;
    value: Note;
    indexes: {
      'by-notebook': string;
      'by-source-type': string;
      'by-updated': string;
      'by-title': string;
    };
  };
  quizzes: {
    key: string;
    value: Quiz;
    indexes: {
      'by-note': string;
      'by-generated': string;
    };
  };
  mcq_cards: {
    key: string;
    value: MCQCard;
    indexes: {
      'by-quiz': string;
    };
  };
  flashcards: {
    key: string;
    value: Flashcard;
    indexes: {
      'by-quiz': string;
    };
  };
  srs_cards: {
    key: string;
    value: SRSCard;
    indexes: {
      'by-card': string;
      'by-next-review': string;
      'by-card-type': string;
    };
  };
  chat_messages: {
    key: string;
    value: ChatMessage;
    indexes: {
      'by-note': string;
      'by-timestamp': string;
    };
  };
  sync_queue: {
    key: string;
    value: SyncEntry;
    indexes: {
      'by-status': string;
      'by-entity': string;
      'by-created': string;
    };
  };
  preferences: {
    key: string;
    value: UserPreference;
  };
}
