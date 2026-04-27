import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.basename(path.resolve(__dirname, '..')) === 'dist' ? path.resolve(__dirname, '..', '..') : path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const dbPath = path.join(dataDir, 'forms.json');
const distDir = path.basename(rootDir) === 'dist' ? rootDir : path.join(rootDir, 'dist');
const app = express();
const port = Number(process.env.PORT || 4177);
const listenHost = process.env.LISTEN_HOST || '0.0.0.0';

const fieldTypes = [
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
  'matrix',
  'hidden',
  'calculated',
  'payment',
  'statement',
  'page_break'
];

const defaultTheme = {
  accent: '#1f7a5f',
  background: '#f7f8f6',
  surface: '#ffffff',
  text: '#1c211f',
  radius: 8,
  font: 'Inter, system-ui, sans-serif',
  customCss: ''
};

const defaultSettings = {
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

app.use(express.json({ limit: '8mb' }));

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'mini-tally' });
});

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify({ forms: [], responses: [], webhookEvents: [] }, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(dbPath, 'utf8');
  const db = JSON.parse(raw);
  return {
    forms: Array.isArray(db.forms) ? db.forms.map(migrateForm) : [],
    responses: Array.isArray(db.responses) ? db.responses.map(migrateResponse) : [],
    webhookEvents: Array.isArray(db.webhookEvents) ? db.webhookEvents : []
  };
}

async function writeDb(db) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-5)}`;
}

function mapLegacyType(type) {
  const map = {
    text: 'short_text',
    textarea: 'long_text',
    select: 'dropdown',
    radio: 'multiple_choice',
    checkbox: 'checkboxes'
  };
  if (fieldTypes.includes(type)) return type;
  return map[type] || 'short_text';
}

function createField(type = 'short_text') {
  const fieldId = id('field');
  const needsOptions = ['dropdown', 'multiple_choice', 'checkboxes', 'multi_select', 'ranking'].includes(type);
  return {
    id: fieldId,
    key: fieldId.replace('field_', 'q_'),
    label: titleCase(type),
    type,
    required: false,
    description: '',
    placeholder: '',
    defaultValue: '',
    options: needsOptions ? ['Option 1', 'Option 2'] : [],
    rows: type === 'matrix' ? ['Row 1', 'Row 2'] : [],
    columns: type === 'matrix' ? ['Column 1', 'Column 2'] : [],
    min: ['rating', 'linear_scale'].includes(type) ? 1 : 0,
    max: ['rating', 'linear_scale'].includes(type) ? 5 : 10,
    step: 1,
    formula: type === 'calculated' ? '0' : '',
    price: type === 'payment' ? 10 : 0,
    currency: type === 'payment' ? 'USD' : ''
  };
}

function titleCase(value) {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeField(raw = {}) {
  const type = mapLegacyType(raw.type);
  const base = createField(type);
  return {
    ...base,
    id: raw.id || base.id,
    key: String(raw.key || raw.id || base.key).slice(0, 80),
    label: String(raw.label || base.label).slice(0, 160),
    type,
    required: Boolean(raw.required),
    description: String(raw.description || '').slice(0, 500),
    placeholder: String(raw.placeholder || '').slice(0, 200),
    defaultValue: String(raw.defaultValue || '').slice(0, 500),
    options: Array.isArray(raw.options) ? raw.options.map(String).filter(Boolean).slice(0, 80) : base.options,
    rows: Array.isArray(raw.rows) ? raw.rows.map(String).filter(Boolean).slice(0, 40) : base.rows,
    columns: Array.isArray(raw.columns) ? raw.columns.map(String).filter(Boolean).slice(0, 20) : base.columns,
    min: Number.isFinite(Number(raw.min)) ? Number(raw.min) : base.min,
    max: Number.isFinite(Number(raw.max)) ? Number(raw.max) : base.max,
    step: Number.isFinite(Number(raw.step)) ? Number(raw.step) : base.step,
    formula: String(raw.formula || base.formula).slice(0, 500),
    price: Number.isFinite(Number(raw.price)) ? Number(raw.price) : base.price,
    currency: String(raw.currency || base.currency).slice(0, 8),
    visibility: raw.visibility?.fieldId
      ? {
          fieldId: String(raw.visibility.fieldId),
          operator: String(raw.visibility.operator || 'equals'),
          value: String(raw.visibility.value || '')
        }
      : undefined
  };
}

function normalizeSettings(raw = {}) {
  return {
    ...defaultSettings,
    ...raw,
    successMessage: String(raw.successMessage || defaultSettings.successMessage).slice(0, 600),
    redirectUrl: String(raw.redirectUrl || '').slice(0, 500),
    password: String(raw.password || '').slice(0, 120),
    preventDuplicates: Boolean(raw.preventDuplicates),
    partialSubmissions: Boolean(raw.partialSubmissions),
    submissionLimit: Math.max(0, Number(raw.submissionLimit) || 0),
    closeAt: String(raw.closeAt || ''),
    customSlug: slugify(raw.customSlug || ''),
    removeBranding: Boolean(raw.removeBranding),
    webhookUrl: String(raw.webhookUrl || '').slice(0, 500),
    webhookSecret: String(raw.webhookSecret || '').slice(0, 200),
    emailNotifications: String(raw.emailNotifications || '').slice(0, 500),
    recaptchaQuestion: String(raw.recaptchaQuestion || '').slice(0, 300),
    recaptchaAnswer: String(raw.recaptchaAnswer || '').slice(0, 120),
    dataRetentionDays: Math.max(0, Number(raw.dataRetentionDays) || 0)
  };
}

function normalizeTheme(raw = {}) {
  return {
    ...defaultTheme,
    ...raw,
    accent: safeColor(raw.accent, defaultTheme.accent),
    background: safeColor(raw.background, defaultTheme.background),
    surface: safeColor(raw.surface, defaultTheme.surface),
    text: safeColor(raw.text, defaultTheme.text),
    radius: Math.max(0, Math.min(24, Number(raw.radius) || defaultTheme.radius)),
    font: String(raw.font || defaultTheme.font).slice(0, 120),
    customCss: String(raw.customCss || '').slice(0, 4000)
  };
}

function safeColor(value, fallback) {
  const text = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function migrateForm(form) {
  return normalizeForm(form, form);
}

function normalizeForm(payload = {}, existing) {
  const title = String(payload.title || '').trim() || 'Untitled form';
  return {
    id: existing?.id || payload.id || id('form'),
    title: title.slice(0, 160),
    description: String(payload.description || '').slice(0, 900),
    published: Boolean(payload.published ?? existing?.published ?? false),
    starred: Boolean(payload.starred ?? existing?.starred ?? false),
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
    fields: Array.isArray(payload.fields) ? payload.fields.map(normalizeField) : [],
    settings: normalizeSettings({ ...existing?.settings, ...payload.settings }),
    theme: normalizeTheme({ ...existing?.theme, ...payload.theme })
  };
}

function migrateResponse(raw) {
  return {
    id: raw.id || id('resp'),
    formId: raw.formId,
    clientId: raw.clientId || '',
    answers: raw.answers || {},
    status: raw.status || 'complete',
    createdAt: raw.createdAt || now(),
    updatedAt: raw.updatedAt || raw.createdAt || now()
  };
}

function publicKey(form) {
  return form.settings?.customSlug || form.id;
}

function findForm(db, idOrSlug) {
  return db.forms.find((form) => form.id === idOrSlug || form.settings.customSlug === idOrSlug);
}

function isClosed(form) {
  return form.settings.closeAt && Date.now() > new Date(form.settings.closeAt).getTime();
}

function visibleFields(form, answers) {
  return form.fields.filter((field) => isFieldVisible(field, answers));
}

function displayAnswer(value) {
  if (value === null || value === undefined || value === '') return '';
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

function isFieldVisible(field, answers) {
  if (!field.visibility?.fieldId) return true;
  const actual = displayAnswer(answers?.[field.visibility.fieldId]);
  const expected = field.visibility.value || '';
  switch (field.visibility.operator) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      return actual.toLowerCase().includes(expected.toLowerCase());
    case 'is_empty':
      return actual === '';
    case 'is_not_empty':
      return actual !== '';
    case 'greater_than':
      return Number(actual) > Number(expected);
    case 'less_than':
      return Number(actual) < Number(expected);
    default:
      return true;
  }
}

function calculateFields(form, answers) {
  const next = { ...answers };
  for (const field of form.fields.filter((item) => item.type === 'calculated')) {
    const expression = String(field.formula || '0').replace(/\{\{([^}]+)\}\}/g, (_match, token) => {
      const name = String(token).trim();
      const source = form.fields.find((item) => item.id === name || item.key === name || item.label === name);
      return source ? Number(displayAnswer(next[source.id])) || 0 : 0;
    });
    try {
      const cleaned = expression.replace(/[^0-9+\-*/().\s]/g, '');
      const result = Function(`"use strict"; return (${cleaned || '0'});`)();
      next[field.id] = Number.isFinite(result) ? String(Math.round(result * 100) / 100) : '0';
    } catch {
      next[field.id] = '0';
    }
  }
  return next;
}

function validateSubmission(form, rawAnswers, options = {}) {
  const answers = calculateFields(form, rawAnswers || {});
  const errors = {};

  if (form.settings.password && options.password !== form.settings.password) {
    errors.__form = 'Password is incorrect.';
  }

  if (form.settings.recaptchaQuestion) {
    const expected = form.settings.recaptchaAnswer.trim().toLowerCase();
    const actual = String(options.recaptcha || '').trim().toLowerCase();
    if (expected && actual !== expected) errors.__recaptcha = 'Verification answer is incorrect.';
  }

  for (const field of visibleFields(form, answers)) {
    if (['statement', 'page_break', 'calculated', 'payment'].includes(field.type)) continue;
    const value = answers[field.id];
    const missing =
      ['checkboxes', 'multi_select', 'ranking'].includes(field.type)
        ? !Array.isArray(value) || value.length === 0
        : field.type === 'matrix'
          ? !value || typeof value !== 'object' || Object.keys(value).length === 0
          : value === undefined || value === null || String(value).trim() === '';

    if (field.required && missing) errors[field.id] = 'Required';
    if (field.type === 'email' && !missing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors[field.id] = 'Invalid email';
    if (field.type === 'url' && !missing && !/^https?:\/\/.+\..+/.test(String(value))) errors[field.id] = 'Enter a valid URL';
    if (['file_upload', 'signature'].includes(field.type) && value) {
      const files = Array.isArray(value) ? value : [value];
      const totalSize = files.reduce((sum, file) => sum + (Number(file?.size) || 0), 0);
      const totalDataUrlSize = files.reduce((sum, file) => sum + String(file?.dataUrl || '').length, 0);
      if (files.length > 10) errors[field.id] = 'Upload up to 10 files';
      if (totalSize > 12 * 1024 * 1024 || totalDataUrlSize > 16_000_000) errors[field.id] = 'Files are too large for local JSON storage';
    }
  }

  return { errors, answers };
}

function csvEscape(value) {
  return `"${displayAnswer(value).replaceAll('"', '""')}"`;
}

function responseRows(form, responses) {
  const header = ['Status', 'Submitted at', 'Updated at', 'Client ID', ...form.fields.map((field) => field.label)];
  const rows = responses.map((response) => [
    response.status,
    response.createdAt,
    response.updatedAt,
    response.clientId,
    ...form.fields.map((field) => response.answers[field.id])
  ]);
  return { header, rows };
}

function applyRetention(db) {
  const keep = [];
  for (const response of db.responses) {
    const form = db.forms.find((item) => item.id === response.formId);
    const days = form?.settings?.dataRetentionDays || 0;
    if (!days) {
      keep.push(response);
      continue;
    }
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    if (new Date(response.createdAt).getTime() >= cutoff) keep.push(response);
  }
  db.responses = keep;
}

async function sendWebhook(form, response) {
  if (!form.settings.webhookUrl) return null;
  const event = {
    eventId: id('evt'),
    eventType: 'FORM_RESPONSE',
    createdAt: now(),
    data: {
      responseId: response.id,
      formId: form.id,
      formName: form.title,
      createdAt: response.createdAt,
      fields: form.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        value: response.answers[field.id] ?? null
      }))
    }
  };

  const body = JSON.stringify(event);
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'Mini Tally Webhooks' };
  if (form.settings.webhookSecret) {
    headers['X-Mini-Tally-Signature'] = crypto.createHmac('sha256', form.settings.webhookSecret).update(body).digest('hex');
  }

  const log = {
    id: event.eventId,
    formId: form.id,
    url: form.settings.webhookUrl,
    createdAt: event.createdAt,
    ok: false,
    status: 0,
    message: ''
  };

  try {
    const result = await fetch(form.settings.webhookUrl, { method: 'POST', headers, body });
    log.ok = result.ok;
    log.status = result.status;
    log.message = result.statusText;
  } catch (error) {
    log.message = error.message;
  }

  return log;
}

app.get('/api/forms', async (_req, res) => {
  const db = await readDb();
  applyRetention(db);
  const forms = db.forms.map((form) => ({
    ...form,
    responseCount: db.responses.filter((response) => response.formId === form.id && response.status === 'complete').length,
    partialCount: db.responses.filter((response) => response.formId === form.id && response.status === 'partial').length
  }));
  await writeDb(db);
  res.json(forms.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});

app.get('/api/forms/:id', async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  res.json(form);
});

app.post('/api/forms', async (req, res) => {
  const db = await readDb();
  const form = normalizeForm(req.body);
  if (form.settings.customSlug && db.forms.some((item) => publicKey(item) === form.settings.customSlug)) {
    return res.status(409).json({ message: 'Slug already exists' });
  }
  db.forms.push(form);
  await writeDb(db);
  res.status(201).json(form);
});

app.put('/api/forms/:id', async (req, res) => {
  const db = await readDb();
  const index = db.forms.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Form not found' });
  const form = normalizeForm({ ...req.body, id: req.params.id }, db.forms[index]);
  if (form.settings.customSlug && db.forms.some((item) => item.id !== form.id && publicKey(item) === form.settings.customSlug)) {
    return res.status(409).json({ message: 'Slug already exists' });
  }
  db.forms[index] = form;
  await writeDb(db);
  res.json(form);
});

app.delete('/api/forms/:id', async (req, res) => {
  const db = await readDb();
  db.forms = db.forms.filter((item) => item.id !== req.params.id);
  db.responses = db.responses.filter((item) => item.formId !== req.params.id);
  await writeDb(db);
  res.status(204).end();
});

app.post('/api/forms/:id/partials', async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form || !form.published || !form.settings.partialSubmissions) return res.status(404).json({ message: 'Partial submissions disabled' });
  const answers = calculateFields(form, req.body.answers || {});
  const clientId = String(req.body.clientId || '');
  if (!clientId || Object.keys(answers).length === 0) return res.status(204).end();

  const existing = db.responses.find((item) => item.formId === form.id && item.clientId === clientId && item.status === 'partial');
  if (existing) {
    existing.answers = { ...existing.answers, ...answers };
    existing.updatedAt = now();
    await writeDb(db);
    return res.json(existing);
  }

  const response = {
    id: id('resp'),
    formId: form.id,
    clientId,
    answers,
    status: 'partial',
    createdAt: now(),
    updatedAt: now()
  };
  db.responses.push(response);
  await writeDb(db);
  res.status(201).json(response);
});

app.post('/api/forms/:id/responses', async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form || !form.published) return res.status(404).json({ message: 'Form is not public' });
  if (isClosed(form)) return res.status(403).json({ message: 'Form is closed' });

  const completeCount = db.responses.filter((item) => item.formId === form.id && item.status === 'complete').length;
  if (form.settings.submissionLimit && completeCount >= form.settings.submissionLimit) {
    return res.status(403).json({ message: 'Submission limit reached' });
  }

  const clientId = String(req.body.clientId || '');
  if (form.settings.preventDuplicates && clientId && db.responses.some((item) => item.formId === form.id && item.clientId === clientId && item.status === 'complete')) {
    return res.status(409).json({ message: 'Duplicate submission blocked' });
  }

  const { errors, answers } = validateSubmission(form, req.body.answers || {}, {
    password: req.body.password,
    recaptcha: req.body.recaptcha
  });
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const response = {
    id: id('resp'),
    formId: form.id,
    clientId,
    answers,
    status: 'complete',
    createdAt: now(),
    updatedAt: now()
  };

  db.responses = db.responses.filter((item) => !(item.formId === form.id && item.clientId === clientId && item.status === 'partial'));
  db.responses.push(response);
  const webhookLog = await sendWebhook(form, response);
  if (webhookLog) db.webhookEvents.push(webhookLog);
  await writeDb(db);
  res.status(201).json(response);
});

app.get('/api/forms/:id/responses', async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  res.json(db.responses.filter((item) => item.formId === form.id && item.status === 'complete').sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.get('/api/forms/:id/partials', async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  res.json(db.responses.filter((item) => item.formId === form.id && item.status === 'partial').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});

app.get('/api/forms/:id/responses.csv', async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).send('Not found');
  const responses = db.responses.filter((item) => item.formId === form.id && item.status === 'complete');
  const { header, rows } = responseRows(form, responses);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${form.id}-responses.csv"`);
  res.send(`\uFEFF${csv}`);
});

app.get('/api/forms/:id/partials.csv', async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).send('Not found');
  const responses = db.responses.filter((item) => item.formId === form.id && item.status === 'partial');
  const { header, rows } = responseRows(form, responses);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${form.id}-partials.csv"`);
  res.send(`\uFEFF${csv}`);
});

async function configureStaticRoutes() {
  try {
    await fs.access(distDir);
    app.use(express.static(distDir));
    app.use((_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  } catch {
    app.get('/', (_req, res) => {
      res.send('Mini Tally API is running. Start the Vite dev server with npm run dev.');
    });
  }
}

async function start() {
  await configureStaticRoutes();
  console.log(`Starting Mini Tally with Node ${process.version}, port ${port}, host ${listenHost}`);

  const server = app.listen(port, listenHost, () => {
    console.log(`Mini Tally running at http://${listenHost}:${port}`);
  });

  server.on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
  });
}

start().catch((error) => {
  console.error('Failed to start Mini Tally:', error);
  process.exit(1);
});
