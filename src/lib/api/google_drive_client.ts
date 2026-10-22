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
  private static readonly _HEADER_AUTHORIZATION = 'Authorization';
  private static readonly _BEARER_PREFIX = 'Bearer ';
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

  public constructor(authService: AuthService, fetchFn: typeof fetch = fetch) {
    this._authService = authService;
    this._fetchFn = fetchFn;
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

    this._validateResponseStatus(response);
    return response.blob();
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

    this._validateResponseStatus(response);
    const data = (await response.json()) as GoogleDriveListResponse;
    const files = data.files ?? [];
    return this._filterEligibleItems(files.map((file) => this._mapRawFileToDriveItem(file)));
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
  protected _validateResponseStatus(response: Response): void {
    if (response.ok) {
      return;
    }
    if (response.status === GoogleDriveApiClient._STATUS_UNAUTHORIZED) {
      throw new Error('Google Drive authentication session expired. Please sign in again.');
    }
    if (response.status === GoogleDriveApiClient._STATUS_RATE_LIMITED) {
      throw new Error('Google Drive API request limit exceeded. Please wait a moment and retry.');
    }
    throw new Error(`Google Drive request failed (${response.status}): ${response.statusText}`);
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
}
