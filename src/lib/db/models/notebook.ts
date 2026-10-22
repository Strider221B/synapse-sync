/**
 * Represents a collection of related notes.
 */
export interface Notebook {
  id: string;
  name: string;
  source: 'google_drive' | 'youtube_playlist' | 'manual';
  sourceUrl?: string;
  description?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  isSynced: boolean;
}
