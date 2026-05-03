import type { AuthState, Form, FormResponse, ResponsePage, WebhookEvent } from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw body;
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  authState: () => request<AuthState>('/api/auth/me'),
  setupAdmin: (password: string) =>
    request<{ ok: true }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ password })
    }),
  login: (password: string) =>
    request<{ ok: true }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    }),
  logout: () =>
    request<void>('/api/auth/logout', {
      method: 'POST'
    }),
  listForms: () => request<Form[]>('/api/forms'),
  getPublicForm: (id: string) => request<Form>(`/api/public/forms/${id}`),
  createForm: (form: Partial<Form>) =>
    request<Form>('/api/forms', {
      method: 'POST',
      body: JSON.stringify(form)
    }),
  updateForm: (id: string, form: Partial<Form>) =>
    request<Form>(`/api/forms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(form)
    }),
  deleteForm: (id: string) =>
    request<void>(`/api/forms/${id}`, {
      method: 'DELETE'
    }),
  submitResponse: (id: string, payload: { answers: FormResponse['answers']; clientId: string; password?: string; recaptcha?: string }) =>
    request<FormResponse>(`/api/forms/${id}/responses`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  savePartial: (id: string, payload: { answers: FormResponse['answers']; clientId: string; password?: string }) =>
    request<FormResponse>(`/api/forms/${id}/partials`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listResponses: (id: string) => request<FormResponse[]>(`/api/forms/${id}/responses`),
  listPartials: (id: string) => request<FormResponse[]>(`/api/forms/${id}/partials`),
  listResponsePage: (id: string, params: { status?: 'complete' | 'partial'; search?: string; from?: string; to?: string; page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') searchParams.set(key, String(value));
    });
    return request<ResponsePage>(`/api/forms/${id}/responses/page?${searchParams.toString()}`);
  },
  listWebhooks: (id: string) => request<WebhookEvent[]>(`/api/forms/${id}/webhooks`)
};
