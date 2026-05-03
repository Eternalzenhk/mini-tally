export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'number'
  | 'phone'
  | 'url'
  | 'date'
  | 'time'
  | 'dropdown'
  | 'multiple_choice'
  | 'checkboxes'
  | 'multi_select'
  | 'file_upload'
  | 'signature'
  | 'rating'
  | 'linear_scale'
  | 'ranking'
  | 'matrix'
  | 'hidden'
  | 'calculated'
  | 'payment'
  | 'statement'
  | 'page_break';

export type LogicOperator = 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty' | 'greater_than' | 'less_than';

export type VisibilityRule = {
  fieldId: string;
  operator: LogicOperator;
  value: string;
};

export type FormField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  description: string;
  placeholder: string;
  defaultValue: string;
  options: string[];
  rows: string[];
  columns: string[];
  min: number;
  max: number;
  step: number;
  formula: string;
  price: number;
  currency: string;
  visibility?: VisibilityRule;
};

export type FormTheme = {
  accent: string;
  background: string;
  surface: string;
  text: string;
  radius: number;
  font: string;
  customCss: string;
};

export type FormSettings = {
  successMessage: string;
  redirectUrl: string;
  password: string;
  preventDuplicates: boolean;
  partialSubmissions: boolean;
  submissionLimit: number;
  closeAt: string;
  customSlug: string;
  removeBranding: boolean;
  webhookUrl: string;
  webhookSecret: string;
  emailNotifications: string;
  recaptchaQuestion: string;
  recaptchaAnswer: string;
  dataRetentionDays: number;
};

export type Form = {
  id: string;
  title: string;
  description: string;
  published: boolean;
  starred?: boolean;
  createdAt: string;
  updatedAt: string;
  fields: FormField[];
  settings: FormSettings;
  theme: FormTheme;
  responseCount?: number;
  partialCount?: number;
};

export type FileAnswer = {
  attachmentId?: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  downloadUrl?: string;
  createdAt?: string;
};

export type AnswerValue = string | string[] | Record<string, string> | FileAnswer | FileAnswer[] | null;

export type FormResponse = {
  id: string;
  formId: string;
  clientId: string;
  answers: Record<string, AnswerValue>;
  status: 'complete' | 'partial';
  createdAt: string;
  updatedAt: string;
};

export type AuthState = {
  configured: boolean;
  authenticated: boolean;
  setupAllowed?: boolean;
};

export type ResponsePage = {
  items: FormResponse[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type WebhookEvent = {
  id: string;
  formId: string;
  responseId: string;
  url: string;
  ok: boolean;
  status: number;
  message: string;
  attempts?: number;
  lastAttemptAt?: string;
  createdAt: string;
};

export type EmailEvent = {
  id: string;
  formId: string;
  responseId: string;
  to: string[];
  ok: boolean;
  message: string;
  createdAt: string;
};

export type MaintenanceEvent = {
  id: string;
  kind: string;
  ok: boolean;
  relativePath: string;
  size: number;
  message: string;
  createdAt: string;
};

export type FormVersion = {
  id: string;
  formId: string;
  action: string;
  title: string;
  fieldCount: number;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  formId: string;
  targetId: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
