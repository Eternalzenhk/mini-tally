import type { AuditEvent, AuthState, EmailEvent, Form, FormResponse, FormVersion, MaintenanceEvent, ResponsePage, WebhookEvent } from './types';

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
  cloneForm: (id: string) =>
    request<Form>(`/api/forms/${id}/clone`, {
      method: 'POST'
    }),
  deleteForm: (id: string) =>
    request<void>(`/api/forms/${id}`, {
      method: 'DELETE'
    }),
  listVersions: (id: string) => request<FormVersion[]>(`/api/forms/${id}/versions`),
  restoreVersion: (id: string, versionId: string) =>
    request<Form>(`/api/forms/${id}/versions/${versionId}/restore`, {
      method: 'POST'
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
  listWebhooks: (id: string) => request<WebhookEvent[]>(`/api/forms/${id}/webhooks`),
  retryWebhook: (id: string, eventId: string) =>
    request<WebhookEvent>(`/api/forms/${id}/webhooks/${eventId}/retry`, {
      method: 'POST'
    }),
  listEmailEvents: (id: string) => request<EmailEvent[]>(`/api/forms/${id}/emails`),
  listAuditEvents: (params: { formId?: string; limit?: number } = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') searchParams.set(key, String(value));
    });
    return request<AuditEvent[]>(`/api/audit-events?${searchParams.toString()}`);
  },
  listBackups: () => request<MaintenanceEvent[]>('/api/maintenance/backups'),
  runBackup: () =>
    request<MaintenanceEvent>('/api/maintenance/backups/run', {
      method: 'POST'
    })
};
