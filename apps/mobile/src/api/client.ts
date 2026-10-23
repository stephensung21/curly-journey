import type { Connection } from './types';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, code?: string) {
    super(code ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export class UnauthorizedError extends ApiError {
  constructor() {
    super(401);
    this.name = 'UnauthorizedError';
  }
}

export async function apiFetch<T>(conn: Connection, path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${conn.token}`,
  };
  const res = await fetch(`${conn.url.replace(/\/+$/, '')}${path}`, { ...init, headers });
  if (res.status === 401) throw new UnauthorizedError();
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const code = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : undefined;
    throw new ApiError(res.status, code);
  }
  return body as T;
}
