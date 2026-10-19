import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthService } from '../../lib/auth/auth_service';
import { OneDriveApiClient, type DriveItem } from '../../lib/api/onedrive_client';

describe('OneDriveApiClient', () => {
  const createMockAuthService = (token = 'mock-bearer-token'): AuthService =>
    ({
      getAccessToken: async () => token,
      isAuthenticated: () => true,
    }) as unknown as AuthService;

  it('lists root items and filters out unsupported file extensions', async () => {
    const mockAuth = createMockAuthService();
    const rawItems: DriveItem[] = [
      { id: '1', name: 'Folder A', folder: { childCount: 2 } },
      { id: '2', name: 'Document.docx', file: { mimeType: 'application/docx' } },
      { id: '3', name: 'Notes.md', file: { mimeType: 'text/markdown' } },
      { id: '4', name: 'Image.png', file: { mimeType: 'image/png' } },
      { id: '5', name: 'Archive.zip', file: { mimeType: 'application/zip' } },
    ];

    let capturedAuthHeader = '';
    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      capturedAuthHeader = headers['Authorization'];
      return new Response(JSON.stringify({ value: rawItems }), { status: 200 });
    };

    const client = new OneDriveApiClient(mockAuth, mockFetch as typeof fetch);
    const items = await client.listRootItems();

    assert.equal(capturedAuthHeader, 'Bearer mock-bearer-token');
    assert.equal(items.length, 3);
    assert.equal(items[0].name, 'Folder A');
    assert.equal(items[1].name, 'Document.docx');
    assert.equal(items[2].name, 'Notes.md');
  });

  it('lists folder items with correct item ID url parameter', async () => {
    const mockAuth = createMockAuthService();
    let requestedUrl = '';
    const mockFetch = async (url: RequestInfo | URL) => {
      requestedUrl = url.toString();
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    };

    const client = new OneDriveApiClient(mockAuth, mockFetch as typeof fetch);
    await client.listFolderItems('folder-xyz');

    assert.ok(requestedUrl.includes('/items/folder-xyz/children'));
  });

  it('downloads file content as a Blob', async () => {
    const mockAuth = createMockAuthService();
    const binaryData = new Uint8Array([1, 2, 3, 4]);
    const mockFetch = async () => new Response(binaryData, { status: 200 });

    const client = new OneDriveApiClient(mockAuth, mockFetch as typeof fetch);
    const blob = await client.downloadFileContent('item-123');

    assert.equal(blob.size, 4);
  });

  it('throws descriptive error on HTTP 401 unauthorized', async () => {
    const mockAuth = createMockAuthService();
    const mockFetch = async () => new Response('', { status: 401, statusText: 'Unauthorized' });

    const client = new OneDriveApiClient(mockAuth, mockFetch as typeof fetch);
    await assert.rejects(
      async () => client.listRootItems(),
      /OneDrive authentication session expired/
    );
  });

  it('throws descriptive error on HTTP 429 rate limit', async () => {
    const mockAuth = createMockAuthService();
    const mockFetch = async () => new Response('', { status: 429, statusText: 'Too Many Requests' });

    const client = new OneDriveApiClient(mockAuth, mockFetch as typeof fetch);
    await assert.rejects(
      async () => client.listRootItems(),
      /OneDrive API request limit exceeded/
    );
  });
});
