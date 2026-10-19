/**
 * Represents a generated quiz for a note.
 */
export interface Quiz {
  id: string;
  noteId: string;
  modelUsed: string;
  version: number;
  generatedAt: string;
}
