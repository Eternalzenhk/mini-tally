import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.basename(path.resolve(__dirname, '..')) === 'dist' ? path.resolve(__dirname, '..', '..') : path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const dbPath = path.join(dataDir, 'forms.json');
const adminConfigPath = path.join(dataDir, 'admin.json');
const distDir = path.basename(rootDir) === 'dist' ? rootDir : path.join(rootDir, 'dist');
const app = express();
const port = Number(process.env.PORT || 4177);
const listenHost = process.env.LISTEN_HOST || '0.0.0.0';
const adminCookieName = 'mini_tally_admin';
const adminSessionSecret = process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const adminSessionTtlMs = 7 * 24 * 60 * 60 * 1000;

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
  const raw = (await fs.readFile(dbPath, 'utf8')).replace(/^\uFEFF/, '');
  const db = JSON.parse(raw);
  return {
    forms: Array.isArray(db.forms) ? db.forms.map(migrateForm) : [],
    responses: Array.isArray(db.responses) ? db.responses.map(migrateResponse) : [],
    webhookEvents: Array.isArray(db.webhookEvents) ? db.webhookEvents : []
  };
}

async function writeJsonAtomic(filePath, value) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2));
  await fs.rename(tmpPath, filePath);
}

async function writeDb(db) {
  await writeJsonAtomic(dbPath, db);
}

let dbQueue = Promise.resolve();

function updateDb(mutator) {
  const next = dbQueue.then(async () => {
    const db = await readDb();
    const result = await mutator(db);
    await writeDb(db);
    return result;
  });
  dbQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-5)}`;
}

function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        try {
          return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
        } catch {
          return [part.slice(0, index), ''];
        }
      })
  );
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', adminSessionSecret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifySession(token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return false;
  const expected = crypto.createHmac('sha256', adminSessionSecret).update(body).digest('base64url');
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.role === 'admin' && Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
}

function cookieOptions(maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : ''
  ]
    .filter(Boolean)
    .join('; ');
}

async function readAdminConfig() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = (await fs.readFile(adminConfigPath, 'utf8')).replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeAdminConfig(config) {
  await fs.mkdir(dataDir, { recursive: true });
  await writeJsonAtomic(adminConfigPath, config);
}

async function adminState() {
  const hasEnvPassword = Boolean(process.env.ADMIN_PASSWORD);
  const config = await readAdminConfig();
  return {
    configured: hasEnvPassword || Boolean(config?.passwordHash),
    source: hasEnvPassword ? 'env' : config?.passwordHash ? 'local' : ''
  };
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString('base64url'));
    });
  });
  return `scrypt:${salt}:${hash}`;
}

async function verifyPassword(password, storedHash) {
  const [method, salt, hash] = String(storedHash || '').split(':');
  if (method !== 'scrypt' || !salt || !hash) return false;
  const nextHash = await hashPassword(password, salt);
  const expected = Buffer.from(storedHash);
  const actual = Buffer.from(nextHash);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function isAdminPassword(password) {
  if (process.env.ADMIN_PASSWORD) {
    const actual = Buffer.from(String(password || ''));
    const expected = Buffer.from(process.env.ADMIN_PASSWORD);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }
  const config = await readAdminConfig();
  return verifyPassword(password, config?.passwordHash);
}

function hasAdminSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifySession(cookies[adminCookieName]);
}

function requireAdmin(req, res, next) {
  if (hasAdminSession(req)) return next();
  return res.status(401).json({ message: 'Admin login required' });
}

function publicForm(form) {
  return {
    ...form,
    settings: {
      ...form.settings,
      password: form.settings.password ? '__protected__' : '',
      webhookUrl: '',
      webhookSecret: '',
      emailNotifications: ''
    }
  };
}

function isLocalAddress(value) {
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
}

function hostNameFromHeader(value) {
  const host = String(value || '').trim().toLowerCase();
  if (!host) return '';
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? host.slice(1) : host.slice(1, end);
  }
  const parts = host.split(':');
  return parts.length === 2 ? parts[0] : host;
}

function isLocalHost(value) {
  const host = hostNameFromHeader(value);
  return host === 'localhost' || isLocalAddress(host);
}

function canRunSetup(req) {
  if (process.env.ALLOW_ADMIN_SETUP === 'true') return true;
  if (process.env.NODE_ENV === 'production') return false;
  const remote = req.socket.remoteAddress || '';
  return isLocalAddress(remote) && isLocalHost(req.headers.host);
}

function setAdminCookie(res, token, maxAgeSeconds) {
  res.setHeader('Set-Cookie', `${adminCookieName}=${encodeURIComponent(token)}; ${cookieOptions(maxAgeSeconds)}`);
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

async function sendWebhookInBackground(form, response) {
  if (!form.settings.webhookUrl) return;
  try {
    const webhookLog = await sendWebhook(form, response);
    if (!webhookLog) return;
    await updateDb((db) => {
      db.webhookEvents.push(webhookLog);
      return null;
    });
  } catch (error) {
    console.error('Webhook delivery failed:', error);
  }
}

app.get('/api/auth/me', async (req, res) => {
  const state = await adminState();
  res.json({
    configured: state.configured,
    authenticated: hasAdminSession(req),
    setupAllowed: !state.configured && canRunSetup(req)
  });
});

app.post('/api/auth/setup', async (req, res) => {
  const state = await adminState();
  if (state.configured) return res.status(409).json({ message: 'Admin password is already configured' });
  if (!canRunSetup(req)) return res.status(403).json({ message: 'Set ADMIN_PASSWORD or enable setup from the server console' });
  const password = String(req.body.password || '');
  if (password.length < 10) return res.status(400).json({ message: 'Use at least 10 characters' });

  await writeAdminConfig({ passwordHash: await hashPassword(password), createdAt: now() });
  const token = signSession({ role: 'admin', exp: Date.now() + adminSessionTtlMs });
  setAdminCookie(res, token, Math.floor(adminSessionTtlMs / 1000));
  res.status(201).json({ ok: true });
});

app.post('/api/auth/login', async (req, res) => {
  const state = await adminState();
  if (!state.configured) return res.status(409).json({ message: 'Admin password is not configured' });
  if (!(await isAdminPassword(req.body.password))) return res.status(401).json({ message: 'Incorrect password' });

  const token = signSession({ role: 'admin', exp: Date.now() + adminSessionTtlMs });
  setAdminCookie(res, token, Math.floor(adminSessionTtlMs / 1000));
  res.json({ ok: true });
});

app.post('/api/auth/logout', (_req, res) => {
  setAdminCookie(res, '', 0);
  res.status(204).end();
});

app.get('/api/public/forms/:id', async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form || !form.published) return res.status(404).json({ message: 'Form not found' });
  res.json(publicForm(form));
});

app.get('/api/forms', requireAdmin, async (_req, res) => {
  const forms = await updateDb((db) => {
    applyRetention(db);
    return db.forms.map((form) => ({
      ...form,
      responseCount: db.responses.filter((response) => response.formId === form.id && response.status === 'complete').length,
      partialCount: db.responses.filter((response) => response.formId === form.id && response.status === 'partial').length
    }));
  });
  res.json(forms.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});

app.get('/api/forms/:id', requireAdmin, async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  res.json(form);
});

app.post('/api/forms', requireAdmin, async (req, res) => {
  const form = await updateDb((db) => {
    const nextForm = normalizeForm(req.body);
    if (nextForm.settings.customSlug && db.forms.some((item) => publicKey(item) === nextForm.settings.customSlug)) {
      return { error: 'Slug already exists', status: 409 };
    }
    db.forms.push(nextForm);
    return nextForm;
  });
  if (form.error) return res.status(form.status).json({ message: form.error });
  res.status(201).json(form);
});

app.put('/api/forms/:id', requireAdmin, async (req, res) => {
  const form = await updateDb((db) => {
    const index = db.forms.findIndex((item) => item.id === req.params.id);
    if (index === -1) return { error: 'Form not found', status: 404 };
    const nextForm = normalizeForm({ ...req.body, id: req.params.id }, db.forms[index]);
    if (nextForm.settings.customSlug && db.forms.some((item) => item.id !== nextForm.id && publicKey(item) === nextForm.settings.customSlug)) {
      return { error: 'Slug already exists', status: 409 };
    }
    db.forms[index] = nextForm;
    return nextForm;
  });
  if (form.error) return res.status(form.status).json({ message: form.error });
  res.json(form);
});

app.delete('/api/forms/:id', requireAdmin, async (req, res) => {
  await updateDb((db) => {
    db.forms = db.forms.filter((item) => item.id !== req.params.id);
    db.responses = db.responses.filter((item) => item.formId !== req.params.id);
    return null;
  });
  res.status(204).end();
});

app.post('/api/forms/:id/partials', async (req, res) => {
  const result = await updateDb((db) => {
    const form = findForm(db, req.params.id);
    if (!form || !form.published || !form.settings.partialSubmissions) return { error: 'Partial submissions disabled', status: 404 };
    const answers = calculateFields(form, req.body.answers || {});
    const clientId = String(req.body.clientId || '');
    if (!clientId || Object.keys(answers).length === 0) return { empty: true };

    const existing = db.responses.find((item) => item.formId === form.id && item.clientId === clientId && item.status === 'partial');
    if (existing) {
      existing.answers = { ...existing.answers, ...answers };
      existing.updatedAt = now();
      return { response: existing, status: 200 };
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
    return { response, status: 201 };
  });
  if (result?.error) return res.status(result.status).json({ message: result.error });
  if (result?.empty) return res.status(204).end();
  if (result.response) return res.status(result.status).json(result.response);
});

app.post('/api/forms/:id/responses', async (req, res) => {
  const result = await updateDb(async (db) => {
    const form = findForm(db, req.params.id);
    if (!form || !form.published) return { error: 'Form is not public', status: 404 };
    if (isClosed(form)) return { error: 'Form is closed', status: 403 };

    const completeCount = db.responses.filter((item) => item.formId === form.id && item.status === 'complete').length;
    if (form.settings.submissionLimit && completeCount >= form.settings.submissionLimit) {
      return { error: 'Submission limit reached', status: 403 };
    }

    const clientId = String(req.body.clientId || '');
    if (form.settings.preventDuplicates && clientId && db.responses.some((item) => item.formId === form.id && item.clientId === clientId && item.status === 'complete')) {
      return { error: 'Duplicate submission blocked', status: 409 };
    }

    const { errors, answers } = validateSubmission(form, req.body.answers || {}, {
      password: req.body.password,
      recaptcha: req.body.recaptcha
    });
    if (Object.keys(errors).length) return { errors, status: 400 };

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
    const webhookForm = form.settings.webhookUrl ? JSON.parse(JSON.stringify(form)) : null;
    return { response, status: 201, webhookForm };
  });
  if (result.error) return res.status(result.status).json({ message: result.error });
  if (result.errors) return res.status(result.status).json({ errors: result.errors });
  res.status(result.status).json(result.response);
  if (result.webhookForm) void sendWebhookInBackground(result.webhookForm, result.response);
});

app.get('/api/forms/:id/responses', requireAdmin, async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  res.json(db.responses.filter((item) => item.formId === form.id && item.status === 'complete').sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.get('/api/forms/:id/partials', requireAdmin, async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  res.json(db.responses.filter((item) => item.formId === form.id && item.status === 'partial').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});

app.get('/api/forms/:id/responses.csv', requireAdmin, async (req, res) => {
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

app.get('/api/forms/:id/partials.csv', requireAdmin, async (req, res) => {
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
