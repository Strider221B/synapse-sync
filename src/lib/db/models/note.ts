/**
 * Represents a study note within a notebook.
 */
export interface Note {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  contentFormat: 'markdown' | 'plaintext';
  sourceType: 'onedrive_docx' | 'onedrive_md' | 'youtube_transcript' | 'manual';
  sourceUrl?: string;
  oneDriveItemId?: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  isSynced: boolean;
}
