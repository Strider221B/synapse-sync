'use client';

import React, { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { AuthService } from '@/lib/auth/auth_service';
import { type DriveItem, OneDriveApiClient } from '@/lib/api/onedrive_client';

export interface SelectedFilePayload {
  item: DriveItem;
  blob: Blob;
}

interface OneDrivePickerProps {
  onImportFiles: (files: SelectedFilePayload[]) => Promise<void>;
  disabled?: boolean;
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

/**
 * Interactive OneDrive file browser component for selecting and importing documents.
 */
export function OneDrivePicker({ onImportFiles, disabled = false }: OneDrivePickerProps) {
  const { instance } = useMsal();
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: null, name: 'My Drive' },
  ]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentFolder = breadcrumbs[breadcrumbs.length - 1];

  useEffect(() => {
    let active = true;
    const folderId = currentFolder.id;

    async function fetchItems() {
      setIsLoading(true);
      setError(null);
      try {
        const authService = new AuthService(instance);
        const client = new OneDriveApiClient(authService);
        const results = folderId
          ? await client.listFolderItems(folderId)
          : await client.listRootItems();
        if (active) setItems(results);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to fetch items from OneDrive');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void Promise.resolve().then(fetchItems);
    return () => {
      active = false;
    };
  }, [currentFolder.id, instance]);

  const handleFolderClick = (folder: DriveItem) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSelectedIds(new Set());
  };

  const handleBreadcrumbClick = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSelectedIds(new Set());
  };

  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(itemId)) {
        updated.delete(itemId);
      } else {
        updated.add(itemId);
      }
      return updated;
    });
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    setIsImporting(true);
    setError(null);
    try {
      const authService = new AuthService(instance);
      const client = new OneDriveApiClient(authService);
      const selectedItems = items.filter((item) => selectedIds.has(item.id));
      const downloads: SelectedFilePayload[] = [];

      for (const item of selectedItems) {
        const blob = await client.downloadFileContent(item.id);
        downloads.push({ item, blob });
      }

      await onImportFiles(downloads);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error downloading selected files');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Breadcrumb Navigation */}
      <nav
        aria-label="OneDrive Breadcrumb"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.35rem',
          fontSize: '0.85rem',
          color: 'var(--color-text-secondary)',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--color-surface-border-subtle)',
        }}
      >
        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <React.Fragment key={crumb.id ?? 'root'}>
              {idx > 0 && <span style={{ color: 'var(--color-text-muted)' }}>/</span>}
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(idx)}
                style={{
                  fontWeight: isLast ? 600 : 400,
                  color: isLast ? 'var(--color-text-primary)' : 'var(--color-primary)',
                  cursor: isLast ? 'default' : 'pointer',
                  padding: '0.15rem 0.35rem',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '0.75rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            fontSize: '0.825rem',
          }}
        >
          {error}
        </div>
      )}

      {/* File List */}
      <div style={{ minHeight: '220px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--color-text-muted)' }}>
            Loading OneDrive items...
          </div>
        ) : items.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--color-text-muted)' }}>
            No folders, .docx, or .md files found in this folder.
          </div>
        ) : (
          items.map((item) => {
            const isFolder = Boolean(item.folder);
            const isSelected = selectedIds.has(item.id);

            return (
              <div
                key={item.id}
                onClick={() => (isFolder ? handleFolderClick(item) : toggleSelect(item.id))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.625rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isSelected ? 'var(--color-primary-light)' : 'transparent',
                  border: isSelected ? '1px solid var(--color-primary-glow)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {!isFolder && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                )}
                <span style={{ fontSize: '1.2rem' }}>
                  {isFolder ? '📁' : item.name.endsWith('.docx') ? '📄' : '📝'}
                </span>
                <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                  {item.name}
                </span>
                {item.size && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {Math.round(item.size / 1024)} KB
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Action Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--color-surface-border-subtle)',
        }}
      >
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          {selectedIds.size} file{selectedIds.size === 1 ? '' : 's'} selected
        </span>

        <button
          type="button"
          disabled={selectedIds.size === 0 || isImporting || disabled}
          onClick={handleImport}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: selectedIds.size > 0 ? 'var(--color-primary)' : 'var(--color-surface-raised)',
            color: selectedIds.size > 0 ? '#ffffff' : 'var(--color-text-muted)',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: selectedIds.size > 0 && !isImporting ? 'pointer' : 'not-allowed',
            transition: 'all var(--transition-fast)',
          }}
        >
          {isImporting ? 'Importing Documents...' : `Import ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
        </button>
      </div>
    </div>
  );
}
