export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: string;
  };
  message?: string;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  public constructor(message: string, status: number, code: string = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Robust HTTP client handling JSON and multipart requests with automatic exponential backoff retry.
 */
export class ApiClient {
  private static readonly _DEFAULT_BASE_URL = '';
  private static readonly _HEADER_CONTENT_TYPE = 'Content-Type';
  private static readonly _HEADER_ACCEPT = 'Accept';
  private static readonly _MIME_JSON = 'application/json';
  private static readonly _METHOD_POST = 'POST';
  private static readonly _MAX_RETRIES = 3;
  private static readonly _INITIAL_BACKOFF_MS = 300;
  private static readonly _STATUS_TOO_MANY_REQUESTS = 429;
  private static readonly _STATUS_SERVER_ERROR_MIN = 500;
  private static readonly _STATUS_SERVER_ERROR_MAX = 599;

  private readonly _baseUrl: string;
  private readonly _fetchFn: typeof fetch;

  public constructor(baseUrl: string = ApiClient._DEFAULT_BASE_URL, fetchFn: typeof fetch = fetch) {
    this._baseUrl = baseUrl;
    this._fetchFn = fetchFn;
  }

  /**
   * Sends a JSON POST request to the specified endpoint with retry capability.
   */
  public async post<T>(endpoint: string, data: unknown): Promise<T> {
    const url = this._buildUrl(endpoint);
    const body = JSON.stringify(data);
    const headers = {
      [ApiClient._HEADER_CONTENT_TYPE]: ApiClient._MIME_JSON,
      [ApiClient._HEADER_ACCEPT]: ApiClient._MIME_JSON,
    };

    return this._executeWithRetry(async () => {
      const response = await this._fetchFn(url, {
        method: ApiClient._METHOD_POST,
        headers,
        body,
      });
      return this._handleResponse<T>(response);
    });
  }

  /**
   * Sends a multipart/form-data POST request with retry capability.
   */
  public async postFormData<T>(endpoint: string, formData: FormData): Promise<T> {
    const url = this._buildUrl(endpoint);
    const headers = {
      [ApiClient._HEADER_ACCEPT]: ApiClient._MIME_JSON,
    };

    return this._executeWithRetry(async () => {
      const response = await this._fetchFn(url, {
        method: ApiClient._METHOD_POST,
        headers,
        body: formData,
      });
      return this._handleResponse<T>(response);
    });
  }

  /**
   * Normalizes the full URL combining base URL and endpoint.
   */
  protected _buildUrl(endpoint: string): string {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    const cleanBase = this._baseUrl.replace(/\/+$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${cleanBase}${cleanEndpoint}`;
  }

  /**
   * Evaluates HTTP response and parses either payload or structured error.
   */
  protected async _handleResponse<T>(response: Response): Promise<T> {
    if (response.ok) {
      return (await response.json()) as T;
    }
    const errorBody = await this._extractErrorPayload(response);
    const errorMessage =
      errorBody.error?.message ?? errorBody.message ?? `HTTP request failed with status ${response.status}`;
    const errorCode = errorBody.error?.code ?? `HTTP_${response.status}`;
    throw new ApiError(errorMessage, response.status, errorCode);
  }

  /**
   * Extracts error payload safely from a response.
   */
  protected async _extractErrorPayload(response: Response): Promise<ApiErrorPayload> {
    try {
      return (await response.json()) as ApiErrorPayload;
    } catch {
      return { message: response.statusText };
    }
  }

  /**
   * Determines if an error is transient and eligible for retry.
   */
  protected _isRetryable(error: unknown): boolean {
    if (error instanceof ApiError) {
      return (
        error.status === ApiClient._STATUS_TOO_MANY_REQUESTS ||
        (error.status >= ApiClient._STATUS_SERVER_ERROR_MIN &&
          error.status <= ApiClient._STATUS_SERVER_ERROR_MAX)
      );
    }
    return error instanceof TypeError; // Network errors in Fetch API are TypeErrors
  }

  /**
   * Executes an operation with exponential backoff retry.
   */
  protected async _executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (attempt <= ApiClient._MAX_RETRIES) {
      try {
        return await operation();
      } catch (err) {
        attempt += 1;
        if (attempt > ApiClient._MAX_RETRIES || !this._isRetryable(err)) {
          throw err;
        }
        const delayMs = ApiClient._INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error('Maximum retry attempts exceeded');
  }
}
