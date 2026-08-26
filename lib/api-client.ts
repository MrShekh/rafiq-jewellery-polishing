/**
 * Thin fetch wrapper shared by every client component. Always sends/reads
 * JSON, and always throws a plain `Error` whose `message` is the
 * user-safe string the API already prepared (see lib/api/respond.ts) - so
 * a `catch` block anywhere in the UI can show `err.message` directly in a
 * toast without re-translating anything.
 */

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string[] | undefined>;

  constructor(message: string, status: number, fieldErrors?: Record<string, string[] | undefined>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const message =
      (body as { error?: string } | null)?.error ??
      "Something went wrong. Please try again.";
    const fieldErrors = (body as { fieldErrors?: Record<string, string[] | undefined> } | null)?.fieldErrors;
    throw new ApiError(message, res.status, fieldErrors);
  }

  return body as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(url: string, data?: unknown) =>
    request<T>(url, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};
