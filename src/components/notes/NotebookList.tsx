'use client';

import React, { useMemo, useState, useTransition } from 'react';
import type { Notebook } from '@/lib/db/models';
import { DatabaseService } from '@/lib/db/database_service';
import { NotebookService } from '@/lib/db/services/notebook_service';

interface NotebookListProps {
  notebooks: Notebook[];
  noteCounts?: Record<string, number>;
  selectedNotebookId?: string | null;
  onSelectNotebook?: (id: string | null) => void;
  onNotebookCreated?: (notebook: Notebook) => void;
}

interface FolderTreeNode {
  notebook: Notebook;
  children: FolderTreeNode[];
  depth: number;
}

/**
 * Component for viewing, selecting, and creating hierarchical folders and sub-folders.
 */
export function NotebookList({
  notebooks,
  noteCounts,
  selectedNotebookId,
  onSelectNotebook,
  onNotebookCreated,
}: NotebookListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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

    // Update depths recursively if tree is deep
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
    setParentId(presetParentId);
    setName('');
    setDescription('');
    setTagsInput('');
    setError(null);
    setShowCreateModal(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Folder name is required');
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const dbService = new DatabaseService();
        const notebookService = new NotebookService(dbService);
        const tags = tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);

        const created = await notebookService.create({
          name: name.trim(),
          parentId: parentId || null,
          description: description.trim(),
          source: 'manual',
          tags,
        });

        // Expand parent folder so newly created subfolder is immediately visible
        if (parentId) {
          setCollapsedFolderIds((prev) => {
            const next = new Set(prev);
            next.delete(parentId);
            return next;
          });
        }

        setName('');
        setParentId(null);
        setDescription('');
        setTagsInput('');
        setShowCreateModal(false);
        if (onNotebookCreated) {
          onNotebookCreated(created);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create folder');
      }
    });
  };

  const renderTreeNode = (node: FolderTreeNode) => {
    const isSelected = selectedNotebookId === node.notebook.id;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedFolderIds.has(node.notebook.id);
    const count = noteCounts?.[node.notebook.id] ?? 0;

    return (
      <div key={node.notebook.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectNotebook?.(node.notebook.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSelectNotebook?.(node.notebook.id);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 0.75rem',
            paddingLeft: `${0.65 + node.depth * 1.15}rem`,
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            backgroundColor: isSelected ? 'var(--color-primary-light)' : 'transparent',
            color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: isSelected ? 600 : 500,
            border: isSelected ? '1px solid var(--color-primary-glow)' : '1px solid transparent',
            transition: 'all var(--transition-fast)',
            gap: '0.4rem',
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
                }}
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
            ) : (
              <span style={{ width: '16px' }} />
            )}

            <span style={{ fontSize: '0.95rem' }}>📁</span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.875rem',
              }}
              title={node.notebook.name}
            >
              {node.notebook.name}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
            {/* Quick Add Subfolder button */}
            <button
              type="button"
              onClick={(e) => openCreateModal(node.notebook.id, e)}
              title={`Add sub-folder inside ${node.notebook.name}`}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                padding: '0.1rem 0.35rem',
                borderRadius: 'var(--radius-xs)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-primary)';
                e.currentTarget.style.backgroundColor = 'var(--color-surface-raised)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-muted)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              + Sub
            </button>

            <span
              style={{
                fontSize: '0.75rem',
                padding: '0.1rem 0.45rem',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-surface-raised)',
                color: 'var(--color-text-muted)',
                minWidth: '22px',
                textAlign: 'center',
              }}
            >
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
            <span
              style={{
                fontSize: '0.75rem',
                padding: '0.1rem 0.45rem',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-surface-raised)',
                color: 'var(--color-text-muted)',
              }}
            >
              {totalNotesCount}
            </span>
          </div>

          {/* Folder Hierarchy Tree */}
          {folderTree.map(renderTreeNode)}
        </div>
      )}

      {/* Modal for Creating New Folder or Sub-Folder */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
              borderRadius: 'var(--radius-xl)',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '460px',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                marginBottom: '1.25rem',
              }}
            >
              {parentId ? 'Create New Sub-folder' : 'Create New Folder'}
            </h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-secondary)',
                    marginBottom: '0.35rem',
                  }}
                >
                  Folder Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Stanford CS229, Week 1, Algorithms"
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-secondary)',
                    marginBottom: '0.35rem',
                  }}
                >
                  Parent Folder (for nesting sub-folders)
                </label>
                <select
                  value={parentId ?? ''}
                  onChange={(e) => setParentId(e.target.value || null)}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">📁 None (Top-Level Folder)</option>
                  {notebooks.map((nb) => (
                    <option key={nb.id} value={nb.id}>
                      📁 {nb.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-secondary)',
                    marginBottom: '0.35rem',
                  }}
                >
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Short description of this subject or topic..."
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-secondary)',
                    marginBottom: '0.35rem',
                  }}
                >
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="lecture-notes, chapter-1, exams"
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              {error && <div style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{error}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text-secondary)',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--color-surface-border)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: isPending ? 'wait' : 'pointer',
                  }}
                >
                  {isPending ? 'Creating...' : parentId ? 'Create Sub-folder' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
