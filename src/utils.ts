import type { AnswerValue, FieldType, FormField, FormSettings, FormTheme, LogicOperator } from './types';

export const fieldTypeLabels: Record<FieldType, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  email: 'Email',
  number: 'Number',
  phone: 'Phone',
  url: 'URL',
  date: 'Date',
  time: 'Time',
  dropdown: 'Dropdown',
  multiple_choice: 'Multiple choice',
  checkboxes: 'Checkboxes',
  multi_select: 'Multi-select',
  file_upload: 'File upload',
  signature: 'Signature',
  rating: 'Rating',
  linear_scale: 'Linear scale',
  ranking: 'Ranking',
  matrix: 'Matrix',
  hidden: 'Hidden field',
  calculated: 'Calculated field',
  payment: 'Payment',
  statement: 'Text block',
  page_break: 'Page break'
};

export const fieldTypes = Object.keys(fieldTypeLabels) as FieldType[];

export const inputFieldTypes: FieldType[] = [
  'short_text',
  'long_text',
  'email',
  'number',
  'phone',
  'url',
  'date',
  'time',
  'dropdown',
  'multiple_choice',
  'checkboxes',
  'multi_select',
  'file_upload',
  'signature',
  'rating',
  'linear_scale',
  'ranking',
  'matrix'
];

export const logicOperators: Record<LogicOperator, string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  contains: 'contains',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  greater_than: 'is greater than',
  less_than: 'is less than'
};

export const defaultTheme: FormTheme = {
  accent: '#1f7a5f',
  background: '#f7f8f6',
  surface: '#ffffff',
  text: '#1c211f',
  radius: 8,
  font: 'Inter, system-ui, sans-serif',
  customCss: ''
};

export const defaultSettings: FormSettings = {
  successMessage: 'Thanks, your response has been submitted.',
  redirectUrl: '',
  password: '',
  preventDuplicates: false,
  partialSubmissions: false,
  submissionLimit: 0,
  closeAt: '',
  customSlug: '',
  removeBranding: false,
  webhookUrl: '',
  webhookSecret: '',
  emailNotifications: '',
  recaptchaQuestion: '',
  recaptchaAnswer: '',
  dataRetentionDays: 0
};

export function createField(type: FieldType = 'short_text'): FormField {
  const id = `field_${Math.random().toString(36).slice(2, 9)}`;
  const needsOptions = ['dropdown', 'multiple_choice', 'checkboxes', 'multi_select', 'ranking'].includes(type);
  const isMatrix = type === 'matrix';
  const isPayment = type === 'payment';
  const isCalculated = type === 'calculated';

  return {
    id,
    key: id.replace('field_', 'q_'),
    label: fieldTypeLabels[type],
    type,
    required: false,
    description: '',
    placeholder: type === 'long_text' ? 'Write a longer answer' : 'Type your answer',
    defaultValue: '',
    options: needsOptions ? ['Option 1', 'Option 2'] : [],
    rows: isMatrix ? ['Row 1', 'Row 2'] : [],
    columns: isMatrix ? ['Column 1', 'Column 2'] : [],
    min: ['rating', 'linear_scale'].includes(type) ? 1 : 0,
    max: ['rating', 'linear_scale'].includes(type) ? 5 : 10,
    step: 1,
    formula: isCalculated ? '0' : '',
    price: isPayment ? 10 : 0,
    currency: isPayment ? 'USD' : ''
  };
}

export function migrateField(raw: Partial<FormField> & { type?: string }): FormField {
  const mappedType = mapLegacyType(raw.type);
  return {
    ...createField(mappedType),
    ...raw,
    type: mappedType,
    key: raw.key || raw.id || createField(mappedType).key,
    label: raw.label || fieldTypeLabels[mappedType],
    description: raw.description || '',
    placeholder: raw.placeholder || '',
    defaultValue: raw.defaultValue || '',
    options: Array.isArray(raw.options) ? raw.options : [],
    rows: Array.isArray(raw.rows) ? raw.rows : [],
    columns: Array.isArray(raw.columns) ? raw.columns : [],
    min: Number.isFinite(raw.min) ? Number(raw.min) : mappedType === 'rating' || mappedType === 'linear_scale' ? 1 : 0,
    max: Number.isFinite(raw.max) ? Number(raw.max) : mappedType === 'rating' || mappedType === 'linear_scale' ? 5 : 10,
    step: Number.isFinite(raw.step) ? Number(raw.step) : 1,
    formula: raw.formula || '',
    price: Number.isFinite(raw.price) ? Number(raw.price) : 0,
    currency: raw.currency || 'USD'
  };
}

function mapLegacyType(type?: string): FieldType {
  const map: Record<string, FieldType> = {
    text: 'short_text',
    textarea: 'long_text',
    select: 'dropdown',
    radio: 'multiple_choice',
    checkbox: 'checkboxes'
  };
  if (type && type in fieldTypeLabels) return type as FieldType;
  return type ? map[type] || 'short_text' : 'short_text';
}

export function formatDate(value: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function absolutePublicUrl(formIdOrSlug: string) {
  return `${window.location.origin}/form/${formIdOrSlug}`;
}

export function absoluteEmbedUrl(formIdOrSlug: string) {
  return `${window.location.origin}/embed/${formIdOrSlug}`;
}

export function displayAnswer(value: AnswerValue): string {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'object' && item && 'name' in item && 'size' in item) {
          return `${item.name} (${Math.round(item.size / 1024)} KB)`;
        }
        return String(item);
      })
      .join(', ');
  }
  if (typeof value === 'object') {
    if ('name' in value && 'size' in value) return `${value.name} (${Math.round(value.size / 1024)} KB)`;
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${item}`)
      .join('; ');
  }
  return String(value);
}

export function getClientId() {
  const key = 'mini_tally_client_id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = `client_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  localStorage.setItem(key, next);
  return next;
}

export function pipeText(text: string, values: Record<string, AnswerValue>, fields: FormField[]) {
  if (!text) return '';
  return text.replace(/\{\{([^}]+)\}\}/g, (_match, token) => {
    const name = String(token).trim();
    const field = fields.find((item) => item.id === name || item.key === name || item.label === name);
    if (!field) return '';
    return displayAnswer(values[field.id]);
  });
}

export function calculateField(field: FormField, values: Record<string, AnswerValue>, fields: FormField[]) {
  const expression = pipeText(field.formula || '0', values, fields).replace(/[^0-9+\-*/().\s]/g, '');
  try {
    const result = Function(`"use strict"; return (${expression || '0'});`)();
    return Number.isFinite(result) ? String(Math.round(result * 100) / 100) : '0';
  } catch {
    return '0';
  }
}

export function isVisible(field: FormField, values: Record<string, AnswerValue>) {
  if (!field.visibility?.fieldId) return true;
  const actual = displayAnswer(values[field.visibility.fieldId]);
  const expected = field.visibility.value || '';

  switch (field.visibility.operator) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      return actual.toLowerCase().includes(expected.toLowerCase());
    case 'is_empty':
      return actual === '-';
    case 'is_not_empty':
      return actual !== '-';
    case 'greater_than':
      return Number(actual) > Number(expected);
    case 'less_than':
      return Number(actual) < Number(expected);
    default:
      return true;
  }
}
