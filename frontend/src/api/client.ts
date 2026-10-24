import type { ApiErrorBody } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
const TOKEN_KEY = 'sakshya.access_token';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function getAccessToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getAccessToken();

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    const apiError = new ApiError(message, 'DEPENDENCY_UNAVAILABLE', 0);
    window.dispatchEvent(new CustomEvent('sakshya:api-error', { detail: apiError }));
    throw apiError;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const body = payload as ApiErrorBody;
    const apiError = new ApiError(
      body.error?.message ?? response.statusText ?? 'Request failed',
      body.error?.code ?? `HTTP_${response.status}`,
      response.status,
      body.error?.details,
    );
    window.dispatchEvent(new CustomEvent('sakshya:api-error', { detail: apiError }));
    throw apiError;
  }

  return payload as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return apiRequest<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return apiRequest<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },
};
