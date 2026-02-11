/**
 * Client-side fetch wrapper for Next.js API routes.
 * Same-origin requests send session cookie automatically; no Bearer token needed.
 */

const API_BASE = '';

type RequestInitJson = Omit<RequestInit, 'body'> & {
  body?: Record<string, unknown> | FormData;
  responseType?: 'json' | 'blob';
};

async function request<T = unknown>(
  path: string,
  options: RequestInitJson = {}
): Promise<{ data: T; ok: true; status: number } | { ok: false; status: number; data?: { message?: string; error?: string } }> {
  const { body, headers = {}, responseType = 'json', ...rest } = options;
  const isFormData = body instanceof FormData;
  const reqHeaders: HeadersInit = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...headers,
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: reqHeaders,
    credentials: 'same-origin',
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });
  let data: T | { message?: string; error?: string };
  if (responseType === 'blob') {
    data = (await res.blob()) as unknown as T;
  } else {
    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      try {
        data = (await res.json()) as T;
      } catch {
        data = {} as T;
      }
    } else {
      data = {} as T;
    }
  }
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return { ok: false, status: 401, data: data as { message?: string; error?: string } };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, data: data as { message?: string; error?: string } };
  }
  return { data: data as T, ok: true, status: res.status };
}

/** GET request; returns parsed JSON or blob. */
export async function apiGet<T = unknown>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  opts?: { responseType?: 'json' | 'blob' }
): Promise<{ data: T; ok: true; status: number } | { ok: false; status: number; data?: { message?: string; error?: string } }> {
  const search = params
    ? new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : '';
  const url = search ? `${path}${path.includes('?') ? '&' : '?'}${search}` : path;
  return request<T>(url, { method: 'GET', responseType: opts?.responseType ?? 'json' });
}

/** POST request with JSON body or FormData. */
export async function apiPost<T = unknown>(
  path: string,
  body?: Record<string, unknown> | FormData,
  opts?: { responseType?: 'json' | 'blob' }
): Promise<{ data: T; ok: true; status: number } | { ok: false; status: number; data?: { message?: string; error?: string } }> {
  return request<T>(path, { method: 'POST', body, responseType: opts?.responseType ?? 'json', ...opts });
}

/** PUT request with JSON body or FormData. */
export async function apiPut<T = unknown>(
  path: string,
  body?: Record<string, unknown> | FormData
): Promise<{ data: T; ok: true; status: number } | { ok: false; status: number; data?: { message?: string; error?: string } }> {
  return request<T>(path, { method: 'PUT', body });
}

/** DELETE request. */
export async function apiDelete<T = unknown>(
  path: string
): Promise<{ data: T; ok: true; status: number } | { ok: false; status: number; data?: { message?: string; error?: string } }> {
  return request<T>(path, { method: 'DELETE' });
}

/** Throw if result is not ok; otherwise return data. */
export function unwrap<T>(result: { data: T; ok: true } | { ok: false; data?: { message?: string; error?: string } }): T {
  if (result.ok) return result.data;
  const msg = result.data?.message ?? result.data?.error ?? 'Request failed';
  throw new Error(msg);
}
