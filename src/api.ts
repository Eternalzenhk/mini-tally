import type { Form, FormResponse } from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
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
  listForms: () => request<Form[]>('/api/forms'),
  getForm: (id: string) => request<Form>(`/api/forms/${id}`),
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
  listPartials: (id: string) => request<FormResponse[]>(`/api/forms/${id}/partials`)
};
