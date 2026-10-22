import type { AuthService } from '../auth/auth_service';

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  folder?: {
    childCount?: number;
  };
  file?: {
    mimeType: string;
  };
  lastModifiedDateTime?: string;
  webUrl?: string;
}

interface GoogleDriveRawFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface GoogleDriveListResponse {
  files?: GoogleDriveRawFile[];
}

/**
 * API client for interacting with Google Drive v3 REST endpoints.
 */
export class GoogleDriveApiClient {
  private static readonly _DRIVE_BASE_URL = 'https://www.googleapis.com/drive/v3';
  private static readonly _DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
  private static readonly _HEADER_AUTHORIZATION = 'Authorization';
  private static readonly _HEADER_CONTENT_TYPE = 'Content-Type';
  private static readonly _BEARER_PREFIX = 'Bearer ';
  private static readonly _MULTIPART_BOUNDARY = '-------synapse_sync_boundary';
  private static readonly _STATUS_UNAUTHORIZED = 401;
  private static readonly _STATUS_RATE_LIMITED = 429;
  private static readonly _FOLDER_MIME = 'application/vnd.google-apps.folder';
  private static readonly _GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
  private static readonly _DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  private static readonly _MARKDOWN_MIME = 'text/markdown';
  private static readonly _DOCX_EXTENSION = '.docx';
  private static readonly _MD_EXTENSION = '.md';
  private static readonly _EXPORT_PLAIN_TEXT = 'text/plain';
  private static readonly _ROOT_FOLDER_ID = 'root';

  private readonly _authService: AuthService;
  private readonly _fetchFn: typeof fetch;

  public constructor(authService: AuthService, fetchFn?: typeof fetch) {
    this._authService = authService;
    this._fetchFn = this._resolveFetch(fetchFn);
  }

  /**
   * Retrieves root drive items filtered to folders, .docx, .md files, and Google Docs.
   */
  public async listRootItems(): Promise<DriveItem[]> {
    return this.listFolderItems(GoogleDriveApiClient._ROOT_FOLDER_ID);
  }

  /**
   * Retrieves items inside a specific folder filtered to eligible document types.
   */
  public async listFolderItems(folderId: string): Promise<DriveItem[]> {
    const query = `'${encodeURIComponent(folderId)}' in parents and trashed = false`;
    const fields = 'files(id, name, mimeType, size, modifiedTime, webViewLink)';
    const orderBy = 'folder,name';
    const params = new URLSearchParams({ q: query, fields, orderBy });
    const url = `${GoogleDriveApiClient._DRIVE_BASE_URL}/files?${params.toString()}`;

    return this._fetchItems(url);
  }

  /**
   * Downloads the content of a file as a Blob (exporting Google Docs as plain text).
   */
  public async downloadFileContent(itemId: string, mimeType?: string): Promise<Blob> {
    const isGoogleDoc = mimeType === GoogleDriveApiClient._GOOGLE_DOC_MIME;
    const url = isGoogleDoc
      ? `${GoogleDriveApiClient._DRIVE_BASE_URL}/files/${encodeURIComponent(itemId)}/export?mimeType=${encodeURIComponent(GoogleDriveApiClient._EXPORT_PLAIN_TEXT)}`
      : `${GoogleDriveApiClient._DRIVE_BASE_URL}/files/${encodeURIComponent(itemId)}?alt=media`;

    const token = await this._authService.getAccessToken();
    const response = await this._fetchFn(url, {
      headers: {
        [GoogleDriveApiClient._HEADER_AUTHORIZATION]: `${GoogleDriveApiClient._BEARER_PREFIX}${token}`,
      },
    });

    await this._validateResponseStatus(response);
    return response.blob();
  }

  /**
   * Uploads and creates a new file in Google Drive.
   */
  public async createFile(
    name: string,
    content: string | Blob,
    mimeType: string = GoogleDriveApiClient._MARKDOWN_MIME,
    parentFolderId?: string
  ): Promise<DriveItem> {
    const token = await this._authService.getAccessToken();
    const metadata: Record<string, unknown> = { name, mimeType };
    if (parentFolderId) metadata.parents = [parentFolderId];

    const body = await this._buildMultipartBody(metadata, content, mimeType);
    const url = `${GoogleDriveApiClient._DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink`;
    const response = await this._fetchFn(url, {
      method: 'POST',
      headers: {
        [GoogleDriveApiClient._HEADER_AUTHORIZATION]: `${GoogleDriveApiClient._BEARER_PREFIX}${token}`,
        [GoogleDriveApiClient._HEADER_CONTENT_TYPE]: body.type,
      },
      body,
    });

    await this._validateResponseStatus(response);
    const file = (await response.json()) as GoogleDriveRawFile;
    return this._mapRawFileToDriveItem(file);
  }

  /**
   * Updates the content of an existing file in Google Drive.
   */
  public async updateFileContent(
    itemId: string,
    content: string | Blob,
    mimeType: string = GoogleDriveApiClient._MARKDOWN_MIME
  ): Promise<DriveItem> {
    const token = await this._authService.getAccessToken();
    const encodedId = encodeURIComponent(itemId);
    const url = `${GoogleDriveApiClient._DRIVE_UPLOAD_URL}/files/${encodedId}?uploadType=media&fields=id,name,mimeType,size,modifiedTime,webViewLink`;
    const body = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;

    const response = await this._fetchFn(url, {
      method: 'PATCH',
      headers: {
        [GoogleDriveApiClient._HEADER_AUTHORIZATION]: `${GoogleDriveApiClient._BEARER_PREFIX}${token}`,
        [GoogleDriveApiClient._HEADER_CONTENT_TYPE]: mimeType,
      },
      body,
    });

    await this._validateResponseStatus(response);
    const file = (await response.json()) as GoogleDriveRawFile;
    return this._mapRawFileToDriveItem(file);
  }

  /**
   * Fetches and maps files from the Google Drive files list endpoint.
   */
  protected async _fetchItems(url: string): Promise<DriveItem[]> {
    const token = await this._authService.getAccessToken();
    const response = await this._fetchFn(url, {
      headers: {
        [GoogleDriveApiClient._HEADER_AUTHORIZATION]: `${GoogleDriveApiClient._BEARER_PREFIX}${token}`,
      },
    });

    await this._validateResponseStatus(response);
    const data = (await response.json()) as GoogleDriveListResponse;
    const files = data.files ?? [];
    return this._filterEligibleItems(files.map((file) => this._mapRawFileToDriveItem(file)));
  }

  /**
   * Constructs a multipart/related request body for Google Drive file uploads.
   */
  protected async _buildMultipartBody(
    metadata: Record<string, unknown>,
    content: string | Blob,
    mimeType: string
  ): Promise<Blob> {
    const delimiter = `\r\n--${GoogleDriveApiClient._MULTIPART_BOUNDARY}\r\n`;
    const closeDelimiter = `\r\n--${GoogleDriveApiClient._MULTIPART_BOUNDARY}--`;
    const metaHeader = 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
    const mediaHeader = `Content-Type: ${mimeType}\r\n\r\n`;

    const metaPart = `${delimiter}${metaHeader}${JSON.stringify(metadata)}${delimiter}${mediaHeader}`;
    const mediaBlob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;

    return new Blob([metaPart, mediaBlob, closeDelimiter], {
      type: `multipart/related; boundary=${GoogleDriveApiClient._MULTIPART_BOUNDARY}`,
    });
  }

  /**
   * Maps a Google Drive API raw file object to a normalized DriveItem.
   */
  protected _mapRawFileToDriveItem(file: GoogleDriveRawFile): DriveItem {
    const isFolder = file.mimeType === GoogleDriveApiClient._FOLDER_MIME;
    return {
      id: file.id,
      name: file.name,
      size: file.size ? Number(file.size) : undefined,
      mimeType: file.mimeType,
      folder: isFolder ? {} : undefined,
      file: isFolder ? undefined : { mimeType: file.mimeType },
      lastModifiedDateTime: file.modifiedTime,
      webUrl: file.webViewLink,
    };
  }

  /**
   * Validates HTTP response status and throws contextual error on failure.
   */
  protected async _validateResponseStatus(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }
    if (response.status === GoogleDriveApiClient._STATUS_UNAUTHORIZED) {
      throw new Error('Google Drive authentication session expired. Please sign in again.');
    }
    if (response.status === GoogleDriveApiClient._STATUS_RATE_LIMITED) {
      throw new Error('Google Drive API request limit exceeded. Please wait a moment and retry.');
    }
    let detail = response.statusText || 'Access Denied';
    try {
      const errData = (await response.clone().json()) as { error?: { message?: string } };
      if (errData?.error?.message) {
        detail = errData.error.message;
      }
    } catch {
      // Keep fallback detail
    }
    throw new Error(`Google Drive request failed (${response.status}): ${detail}`);
  }

  /**
   * Filters items to only include directories or allowed document types.
   */
  protected _filterEligibleItems(items: DriveItem[]): DriveItem[] {
    return items.filter((item) => {
      if (item.folder) {
        return true;
      }
      const lower = item.name.toLowerCase();
      const mime = item.mimeType ?? '';
      return (
        lower.endsWith(GoogleDriveApiClient._DOCX_EXTENSION) ||
        lower.endsWith(GoogleDriveApiClient._MD_EXTENSION) ||
        mime === GoogleDriveApiClient._GOOGLE_DOC_MIME ||
        mime === GoogleDriveApiClient._DOCX_MIME ||
        mime === GoogleDriveApiClient._MARKDOWN_MIME
      );
    });
  }

  /**
   * Resolves a bound fetch function safe for browser and Node execution.
   */
  private _resolveFetch(customFetch?: typeof fetch): typeof fetch {
    if (customFetch) {
      return (input: RequestInfo | URL, init?: RequestInit) =>
        customFetch.call(typeof window !== 'undefined' ? window : globalThis, input, init);
    }
    if (typeof window !== 'undefined' && window.fetch) {
      return window.fetch.bind(window);
    }
    if (typeof globalThis !== 'undefined' && globalThis.fetch) {
      return globalThis.fetch.bind(globalThis);
    }
    return (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init);
  }
}
