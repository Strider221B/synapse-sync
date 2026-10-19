import type { AuthService } from '../auth/auth_service';

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  folder?: {
    childCount: number;
  };
  file?: {
    mimeType: string;
  };
  lastModifiedDateTime?: string;
  webUrl?: string;
}

interface GraphChildrenResponse {
  value: DriveItem[];
}

/**
 * API client for interacting with Microsoft Graph OneDrive endpoints.
 */
export class OneDriveApiClient {
  private static readonly _GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
  private static readonly _HEADER_AUTHORIZATION = 'Authorization';
  private static readonly _BEARER_PREFIX = 'Bearer ';
  private static readonly _STATUS_UNAUTHORIZED = 401;
  private static readonly _STATUS_RATE_LIMITED = 429;
  private static readonly _DOCX_EXTENSION = '.docx';
  private static readonly _MD_EXTENSION = '.md';

  private readonly _authService: AuthService;
  private readonly _fetchFn: typeof fetch;

  public constructor(authService: AuthService, fetchFn: typeof fetch = fetch) {
    this._authService = authService;
    this._fetchFn = fetchFn;
  }

  /**
   * Retrieves root drive items filtered to folders, .docx, and .md files.
   */
  public async listRootItems(): Promise<DriveItem[]> {
    const url = `${OneDriveApiClient._GRAPH_BASE_URL}/me/drive/root/children`;
    return this._fetchItems(url);
  }

  /**
   * Retrieves items inside a specific folder filtered to folders, .docx, and .md files.
   */
  public async listFolderItems(folderId: string): Promise<DriveItem[]> {
    const encodedId = encodeURIComponent(folderId);
    const url = `${OneDriveApiClient._GRAPH_BASE_URL}/me/drive/items/${encodedId}/children`;
    return this._fetchItems(url);
  }

  /**
   * Downloads the raw binary content of a file item as a Blob.
   */
  public async downloadFileContent(itemId: string): Promise<Blob> {
    const encodedId = encodeURIComponent(itemId);
    const url = `${OneDriveApiClient._GRAPH_BASE_URL}/me/drive/items/${encodedId}/content`;
    const token = await this._authService.getAccessToken();

    const response = await this._fetchFn(url, {
      headers: {
        [OneDriveApiClient._HEADER_AUTHORIZATION]: `${OneDriveApiClient._BEARER_PREFIX}${token}`,
      },
    });

    this._validateResponseStatus(response);
    return response.blob();
  }

  /**
   * Fetches and filters items from the specified Graph API URL.
   */
  protected async _fetchItems(url: string): Promise<DriveItem[]> {
    const token = await this._authService.getAccessToken();
    const response = await this._fetchFn(url, {
      headers: {
        [OneDriveApiClient._HEADER_AUTHORIZATION]: `${OneDriveApiClient._BEARER_PREFIX}${token}`,
      },
    });

    this._validateResponseStatus(response);
    const data = (await response.json()) as GraphChildrenResponse;
    return this._filterEligibleItems(data.value ?? []);
  }

  /**
   * Validates HTTP response status and throws contextual error on failure.
   */
  protected _validateResponseStatus(response: Response): void {
    if (response.ok) {
      return;
    }
    if (response.status === OneDriveApiClient._STATUS_UNAUTHORIZED) {
      throw new Error('OneDrive authentication session expired. Please sign in again.');
    }
    if (response.status === OneDriveApiClient._STATUS_RATE_LIMITED) {
      throw new Error('OneDrive API request limit exceeded. Please wait a moment and retry.');
    }
    throw new Error(`OneDrive request failed (${response.status}): ${response.statusText}`);
  }

  /**
   * Filters items to only include directories or allowed document types (.docx, .md).
   */
  protected _filterEligibleItems(items: DriveItem[]): DriveItem[] {
    return items.filter((item) => {
      if (item.folder) {
        return true;
      }
      const lower = item.name.toLowerCase();
      return (
        lower.endsWith(OneDriveApiClient._DOCX_EXTENSION) ||
        lower.endsWith(OneDriveApiClient._MD_EXTENSION)
      );
    });
  }
}
