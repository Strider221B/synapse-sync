'use client';

import React, { useMemo, useState, useTransition } from 'react';
import type { Notebook } from '@/lib/db/models';
import { DatabaseService } from '@/lib/db/database_service';
import { NotebookService } from '@/lib/db/services/notebook_service';
import { MoveFolderModal } from './MoveFolderModal';
import { CreateFolderModal } from './CreateFolderModal';

interface NotebookListProps {
  notebooks: Notebook[];
  noteCounts?: Record<string, number>;
  selectedNotebookId?: string | null;
  onSelectNotebook?: (id: string | null) => void;
  onNotebookCreated?: (notebook: Notebook) => void;
  onNotebookUpdated?: (notebook: Notebook) => void;
  onNotebookDeleted?: (id: string) => void;
}

interface FolderTreeNode {
  notebook: Notebook;
  children: FolderTreeNode[];
  depth: number;
}

/**
 * Component for viewing, selecting, and managing hierarchical folders and sub-folders.
 */
export function NotebookList({
  notebooks,
  noteCounts,
  selectedNotebookId,
  onSelectNotebook,
  onNotebookCreated,
  onNotebookUpdated,
  onNotebookDeleted,
}: NotebookListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPresetParentId, setCreatePresetParentId] = useState<string | null>(null);
  const [folderToMove, setFolderToMove] = useState<Notebook | null>(null);
  const [, startTransition] = useTransition();
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const [isMobileExpanded, setIsMobileExpanded] = useState(true);

  // Build recursive tree from flat list of notebooks/folders
  const folderTree = useMemo(() => {
    const map = new Map<string, FolderTreeNode>();
    notebooks.forEach((nb) => {
      map.set(nb.id, { notebook: nb, children: [], depth: 0 });
    });

    const roots: FolderTreeNode[] = [];
    notebooks.forEach((nb) => {
      const node = map.get(nb.id);
      if (!node) return;
      if (nb.parentId && map.has(nb.parentId)) {
        const parentNode = map.get(nb.parentId)!;
        node.depth = parentNode.depth + 1;
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const assignDepths = (nodes: FolderTreeNode[], currentDepth: number) => {
      nodes.forEach((n) => {
        n.depth = currentDepth;
        assignDepths(n.children, currentDepth + 1);
      });
    };
    assignDepths(roots, 0);

    return roots;
  }, [notebooks]);

  const toggleFolderCollapse = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const openCreateModal = (presetParentId: string | null = null, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCreatePresetParentId(presetParentId);
    setShowCreateModal(true);
  };

  const handleCreated = (created: Notebook) => {
    if (created.parentId) {
      setCollapsedFolderIds((prev) => {
        const next = new Set(prev);
        next.delete(created.parentId!);
        return next;
      });
    }
    onNotebookCreated?.(created);
  };

  const handleDeleteFolder = (folder: Notebook, e: React.MouseEvent) => {
    e.stopPropagation();
    const count = noteCounts?.[folder.id] ?? 0;
    const hasSubfolders = notebooks.some((nb) => nb.parentId === folder.id);
    if (count > 0 || hasSubfolders) {
      alert('Cannot delete folder: it contains notes or sub-folders.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete the empty folder "${folder.name}"?`
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const dbService = new DatabaseService();
        const notebookService = new NotebookService(dbService);
        await notebookService.delete(folder.id);

        const { SyncManager } = await import('@/lib/db/sync_manager');
        const syncService = SyncManager.getInstance().getSyncService();
        if (syncService) {
          await syncService.deleteRemoteNotebook(folder.id).catch(() => {});
        }
        void SyncManager.getInstance().forceSync().catch(() => {});

        onNotebookDeleted?.(folder.id);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to delete folder');
      }
    });
  };

  const renderTreeNode = (node: FolderTreeNode) => {
    const isSelected = selectedNotebookId === node.notebook.id;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedFolderIds.has(node.notebook.id);
    const count = noteCounts?.[node.notebook.id] ?? 0;
    const isEmptyFolder = count === 0 && !hasChildren;

    return (
      <div key={node.notebook.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          role="button"
          tabIndex={0}
          className="folder-tree-row"
          onClick={() => onSelectNotebook?.(node.notebook.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSelectNotebook?.(node.notebook.id);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.45rem 0.65rem',
            paddingLeft: `${0.65 + node.depth * 1.15}rem`,
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            backgroundColor: isSelected ? 'var(--color-primary-light)' : 'transparent',
            color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: isSelected ? 600 : 500,
            border: isSelected ? '1px solid var(--color-primary-glow)' : '1px solid transparent',
            transition: 'all var(--transition-fast)',
            gap: '0.4rem',
            minHeight: '36px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, flex: 1 }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleFolderCollapse(node.notebook.id, e)}
                aria-label={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '0 0.15rem',
                  fontSize: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '16px',
                  height: '16px',
                  flexShrink: 0,
                }}
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
            ) : (
              <span style={{ width: '16px', flexShrink: 0 }} />
            )}

            <span style={{ fontSize: '0.95rem', flexShrink: 0 }}>📁</span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.875rem',
                minWidth: 0,
                flex: 1,
              }}
              title={node.notebook.name}
            >
              {node.notebook.name}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
            <div className="folder-row-actions">
              <button
                type="button"
                onClick={(e) => openCreateModal(node.notebook.id, e)}
                title={`Add sub-folder inside "${node.notebook.name}"`}
                aria-label="Add sub-folder"
                className="folder-action-btn"
              >
                +
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFolderToMove(node.notebook);
                }}
                title={`Move folder "${node.notebook.name}"`}
                aria-label="Move folder"
                className="folder-action-btn"
              >
                ⇄
              </button>

              <button
                type="button"
                disabled={!isEmptyFolder}
                onClick={(e) => handleDeleteFolder(node.notebook, e)}
                title={
                  isEmptyFolder
                    ? `Delete empty folder "${node.notebook.name}"`
                    : `Cannot delete: contains ${count} note${count === 1 ? '' : 's'} and ${node.children.length} sub-folder${node.children.length === 1 ? '' : 's'}`
                }
                aria-label="Delete empty folder"
                className={`folder-action-btn ${isEmptyFolder ? 'action-delete' : 'action-disabled'}`}
              >
                🗑️
              </button>
            </div>

            <span className="folder-count-badge">
              {count}
            </span>
          </div>
        </div>

        {hasChildren && !isCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {node.children.map(renderTreeNode)}
          </div>
        )}
      </div>
    );
  };

  const totalNotesCount = Object.values(noteCounts ?? {}).reduce((acc, c) => acc + c, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header with Title and New Folder Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setIsMobileExpanded((prev) => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <h3
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: 0,
            }}
          >
            Folders ({notebooks.length})
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {isMobileExpanded ? '▲' : '▼'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => openCreateModal(null)}
          style={{
            fontSize: '0.75rem',
            padding: '0.35rem 0.65rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            fontWeight: 600,
            border: '1px solid var(--color-primary-glow)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          + New Folder
        </button>
      </div>

      {isMobileExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {/* All Notes Root Option */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectNotebook?.(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSelectNotebook?.(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.55rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              backgroundColor:
                selectedNotebookId === null || selectedNotebookId === undefined
                  ? 'var(--color-primary-light)'
                  : 'transparent',
              color:
                selectedNotebookId === null || selectedNotebookId === undefined
                  ? 'var(--color-primary)'
                  : 'var(--color-text-secondary)',
              fontWeight: selectedNotebookId === null || selectedNotebookId === undefined ? 600 : 500,
              border:
                selectedNotebookId === null || selectedNotebookId === undefined
                  ? '1px solid var(--color-primary-glow)'
                  : '1px solid transparent',
              transition: 'all var(--transition-fast)',
            }}
          >
            <span style={{ fontSize: '0.875rem' }}>📚 All Notes</span>
            <span className="folder-count-badge">
              {totalNotesCount}
            </span>
          </div>

          {/* Folder Hierarchy Tree */}
          {folderTree.map(renderTreeNode)}
        </div>
      )}

      {/* Modal for Creating New Folder or Sub-Folder */}
      <CreateFolderModal
        isOpen={showCreateModal}
        parentId={createPresetParentId}
        notebooks={notebooks}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />

      {/* Move Folder Modal */}
      <MoveFolderModal
        folder={folderToMove}
        notebooks={notebooks}
        isOpen={Boolean(folderToMove)}
        onClose={() => setFolderToMove(null)}
        onMoved={(updated) => {
          onNotebookUpdated?.(updated);
          setFolderToMove(null);
        }}
      />
    </div>
  );
}
