/**
 * Represents an operation queued for offline-first synchronization.
 */
export interface SyncEntry {
  id: string;
  entityType: 'notebook' | 'note' | 'quiz' | 'srs_card';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  createdAt: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  retryCount: number;
  errorMessage?: string;
}
