import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiClient, ApiError } from '../../lib/api/client';

describe('ApiClient', () => {
  it('posts JSON payload and parses successful response', async () => {
    let capturedBody = '';
    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ success: true, count: 5 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new ApiClient('https://api.example.com', mockFetch as typeof fetch);
    const result = await client.post<{ success: boolean; count: number }>('/test', { hello: 'world' });

    assert.equal(result.success, true);
    assert.equal(result.count, 5);
    assert.equal(capturedBody, JSON.stringify({ hello: 'world' }));
  });

  it('posts FormData payload and parses successful response', async () => {
    const formData = new FormData();
    formData.append('key', 'value');

    const mockFetch = async () =>
      new Response(JSON.stringify({ text: 'parsed content' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const client = new ApiClient('', mockFetch as typeof fetch);
    const result = await client.postFormData<{ text: string }>('/parse', formData);

    assert.equal(result.text, 'parsed content');
  });

  it('throws ApiError with error details on HTTP 400', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          error: { code: 'INVALID_REQUEST', message: 'Missing required field' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );

    const client = new ApiClient('', mockFetch as typeof fetch);
    await assert.rejects(
      async () => client.post('/bad', {}),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 400);
        assert.equal(err.code, 'INVALID_REQUEST');
        assert.equal(err.message, 'Missing required field');
        return true;
      }
    );
  });

  it('retries on HTTP 429 status and succeeds on subsequent try', async () => {
    let calls = 0;
    const mockFetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ message: 'Rate limited' }), { status: 429 });
      }
      return new Response(JSON.stringify({ done: true }), { status: 200 });
    };

    const client = new ApiClient('', mockFetch as typeof fetch);
    const result = await client.post<{ done: boolean }>('/retry', {});
    assert.equal(result.done, true);
    assert.equal(calls, 2);
  });

  it('performs GET request and parses response', async () => {
    let capturedMethod = '';
    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedMethod = init?.method || '';
      return new Response(JSON.stringify({ notebooks: [], notes: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new ApiClient('https://api.example.com', mockFetch as typeof fetch);
    const result = await client.get<{ notebooks: unknown[]; notes: unknown[] }>('/api/youtube-notes');

    assert.equal(capturedMethod, 'GET');
    assert.deepEqual(result.notebooks, []);
  });

  it('invokes fetch without binding this to ApiClient, avoiding illegal invocation', async () => {
    function strictFetch(this: unknown) {
      if (this instanceof ApiClient) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(new Response(JSON.stringify({ safe: true }), { status: 200 }));
    }

    const client = new ApiClient('', strictFetch as unknown as typeof fetch);
    const result = await client.get<{ safe: boolean }>('/safe-fetch');
    assert.equal(result.safe, true);
  });
});

