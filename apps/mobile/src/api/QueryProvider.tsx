import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError, UnauthorizedError } from './client';
import { clearConnection } from './connection';
import { useConnectionStore } from './connectionStore';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    // Bad token anywhere: forget the connection and every cached response (keys carry no URL or token).
    const handleUnauthorized = (error: unknown) => {
      if (!(error instanceof UnauthorizedError)) return;
      useConnectionStore.setState({ conn: null, loading: false, authError: true });
      clearConnection().catch(() => {});
      client.clear();
    };
    const client: QueryClient = new QueryClient({
      queryCache: new QueryCache({ onError: handleUnauthorized }),
      mutationCache: new MutationCache({ onError: handleUnauthorized }),
      defaultOptions: {
        queries: { retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 },
      },
    });
    return client;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
