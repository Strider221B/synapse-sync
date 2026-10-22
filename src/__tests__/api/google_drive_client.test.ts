import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthService } from '../../lib/auth/auth_service';
import { GoogleDriveApiClient, type DriveItem } from '../../lib/api/google_drive_client';

describe('GoogleDriveApiClient', () => {
  const MOCK_TOKEN = 'mock-google-token-xyz';
  const mockAuth = {
    getAccessToken: async () => MOCK_TOKEN,
  } as unknown as AuthService;

  it('retrieves and filters root drive items including folders, docx, md, and google docs', async () => {
    const rawFiles = [
      { id: 'f1', name: 'Course Syllabus.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: '10240' },
      { id: 'f2', name: 'Lecture Notes.md', mimeType: 'text/markdown', size: '2048' },
      { id: 'f3', name: 'Study Guide', mimeType: 'application/vnd.google-apps.document' },
      { id: 'f4', name: 'CS229 Folder', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'f5', name: 'archive.zip', mimeType: 'application/zip', size: '50000' },
      { id: 'f6', name: 'photo.png', mimeType: 'image/png', size: '12000' },
    ];

    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      assert.ok(urlStr.includes('files?'));
      assert.ok(urlStr.includes('root'));
      assert.equal(init?.headers && (init.headers as Record<string, string>)['Authorization'], `Bearer ${MOCK_TOKEN}`);
      return new Response(JSON.stringify({ files: rawFiles }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new GoogleDriveApiClient(mockAuth, mockFetch as typeof fetch);
    const items = await client.listRootItems();

    assert.equal(items.length, 4);
    assert.deepEqual(
      items.map((i: DriveItem) => i.name),
      ['Course Syllabus.docx', 'Lecture Notes.md', 'Study Guide', 'CS229 Folder']
    );
    assert.ok(items[3].folder);
    assert.equal(items[0].size, 10240);
  });

  it('retrieves items for a subfolder', async () => {
    const rawFiles = [
      { id: 'sub1', name: 'Module1.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: '4096' },
    ];

    const mockFetch = async (url: string | URL | Request) => {
      assert.ok(url.toString().includes('folder-abc'));
      return new Response(JSON.stringify({ files: rawFiles }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new GoogleDriveApiClient(mockAuth, mockFetch as typeof fetch);
    const items = await client.listFolderItems('folder-abc');

    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'sub1');
  });

  it('downloads standard file content using alt=media', async () => {
    const mockBlob = new Blob(['sample docx binary content']);
    const mockFetch = async (url: string | URL | Request) => {
      assert.ok(url.toString().includes('/files/item-docx?alt=media'));
      return new Response(mockBlob, { status: 200 });
    };

    const client = new GoogleDriveApiClient(mockAuth, mockFetch as typeof fetch);
    const blob = await client.downloadFileContent('item-docx');

    assert.equal(await blob.text(), 'sample docx binary content');
  });

  it('downloads Google Docs by exporting as text/plain', async () => {
    const mockBlob = new Blob(['sample google doc text content']);
    const mockFetch = async (url: string | URL | Request) => {
      assert.ok(url.toString().includes('/files/doc-123/export?mimeType=text%2Fplain'));
      return new Response(mockBlob, { status: 200 });
    };

    const client = new GoogleDriveApiClient(mockAuth, mockFetch as typeof fetch);
    const blob = await client.downloadFileContent('doc-123', 'application/vnd.google-apps.document');

    assert.equal(await blob.text(), 'sample google doc text content');
  });

  it('throws descriptive error on 401 unauthorized session expiry', async () => {
    const mockFetch = async () => new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    const client = new GoogleDriveApiClient(mockAuth, mockFetch as typeof fetch);

    await assert.rejects(
      async () => client.listRootItems(),
      /Google Drive authentication session expired/
    );
  });

  it('throws descriptive error on 429 rate limit exceeded', async () => {
    const mockFetch = async () => new Response('Rate Limit', { status: 429, statusText: 'Too Many Requests' });
    const client = new GoogleDriveApiClient(mockAuth, mockFetch as typeof fetch);

    await assert.rejects(
      async () => client.listRootItems(),
      /Google Drive API request limit exceeded/
    );
  });

  it('uploads and creates a new file in Google Drive via multipart upload', async () => {
    const rawCreated = {
      id: 'created-file-id',
      name: 'Notes.md',
      mimeType: 'text/markdown',
      size: '128',
      modifiedTime: '2026-10-22T03:00:00Z',
      webViewLink: 'https://drive.google.com/file/d/created-file-id/view',
    };

    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      assert.ok(url.toString().includes('/files?uploadType=multipart'));
      assert.equal(init?.method, 'POST');
      assert.equal(init?.headers && (init.headers as Record<string, string>)['Authorization'], `Bearer ${MOCK_TOKEN}`);
      assert.ok(init?.body);
      return new Response(JSON.stringify(rawCreated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new GoogleDriveApiClient(mockAuth, mockFetch as typeof fetch);
    const item = await client.createFile('Notes.md', '# Header Content', 'text/markdown', 'parent-folder-1');

    assert.equal(item.id, 'created-file-id');
    assert.equal(item.name, 'Notes.md');
    assert.equal(item.webUrl, 'https://drive.google.com/file/d/created-file-id/view');
  });

  it('updates the content of an existing file in Google Drive', async () => {
    const rawUpdated = {
      id: 'existing-file-id',
      name: 'Existing.md',
      mimeType: 'text/markdown',
      size: '256',
      modifiedTime: '2026-10-22T03:15:00Z',
    };

    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      assert.ok(url.toString().includes('/files/existing-file-id?uploadType=media'));
      assert.equal(init?.method, 'PATCH');
      assert.equal(init?.headers && (init.headers as Record<string, string>)['Authorization'], `Bearer ${MOCK_TOKEN}`);
      return new Response(JSON.stringify(rawUpdated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new GoogleDriveApiClient(mockAuth, mockFetch as typeof fetch);
    const item = await client.updateFileContent('existing-file-id', 'Updated Markdown Body');

    assert.equal(item.id, 'existing-file-id');
    assert.equal(item.size, 256);
  });
});
