import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ApiError, UnauthorizedError, apiFetch } from '../src/api/client';
import { clearConnection } from '../src/api/connection';
import { useConnectionStore } from '../src/api/connectionStore';
import { useAccounts, useSyncNow } from '../src/api/hooks';
import { QueryProvider } from '../src/api/QueryProvider';

const conn = { url: 'https://api.test', token: 'cj_x' };
const fetchMock = jest.fn();

function res(status: number, body?: unknown) {
  return { status, ok: status >= 200 && status < 300, text: async () => (body === undefined ? '' : JSON.stringify(body)) };
}

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  (clearConnection as jest.Mock).mockClear();
  useConnectionStore.setState({ conn, loading: false, authError: false });
});

describe('apiFetch', () => {
  it('sends the bearer token', async () => {
    fetchMock.mockResolvedValue(res(200, { ok: 1 }));
    await expect(apiFetch(conn, '/accounts')).resolves.toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/accounts');
    expect(init.headers.Authorization).toBe('Bearer cj_x');
  });

  it('throws UnauthorizedError on 401', async () => {
    fetchMock.mockResolvedValue(res(401));
    await expect(apiFetch(conn, '/accounts')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws ApiError with status on other failures', async () => {
    fetchMock.mockResolvedValue(res(502, { error: 'sync_failed' }));
    await expect(apiFetch(conn, '/sync')).rejects.toMatchObject({ status: 502 });
    await expect(apiFetch(conn, '/sync')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('hooks', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryProvider>{children}</QueryProvider>;

  it('useAccounts on 401 clears the connection', async () => {
    fetchMock.mockResolvedValue(res(401));
    await renderHook(() => useAccounts(), { wrapper });
    await waitFor(() => expect(clearConnection).toHaveBeenCalled());
    expect(useConnectionStore.getState().conn).toBeNull();
    expect(useConnectionStore.getState().authError).toBe(true);
  });

  it('useSyncNow resolves on 409 sync_in_progress', async () => {
    fetchMock.mockResolvedValue(res(409, { error: 'sync_in_progress' }));
    const qc = new QueryClient();
    const { result } = await renderHook(() => useSyncNow(), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    await expect(result.current.mutateAsync()).resolves.toEqual({ error: 'sync_in_progress' });
  });
});
