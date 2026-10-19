/**
 * Represents a study assistant chat message scoped to a note.
 */
export interface ChatMessage {
  id: string;
  noteId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
