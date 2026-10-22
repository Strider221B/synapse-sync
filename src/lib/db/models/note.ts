/**
 * Represents a study note within a notebook.
 */
export interface Note {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  contentFormat: 'markdown' | 'plaintext';
  sourceType: 'gdrive_docx' | 'gdrive_md' | 'gdrive_doc' | 'youtube_transcript' | 'manual';
  sourceUrl?: string;
  googleDriveFileId?: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  isSynced: boolean;
}
