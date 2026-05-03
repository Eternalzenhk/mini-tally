import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import {
  createBackup,
  ensureStore,
  getAttachment,
  getFormVersion,
  getUploadAbsolutePath,
  insertAuditEvent,
  insertEmailEvent,
  insertFormVersion,
  listAuditEvents,
  listEmailEvents,
  listFormVersions,
  listMaintenanceEvents,
  materializeAnswers,
  readAdminConfig,
  readDb,
  stripPrivateAttachmentData,
  updateDb,
  validateAttachmentValue,
  withAttachmentDownloadUrls,
  writeAdminConfig
} from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.basename(path.resolve(__dirname, '..')) === 'dist' ? path.resolve(__dirname, '..', '..') : path.resolve(__dirname, '..');
const distDir = path.basename(rootDir) === 'dist' ? rootDir : path.join(rootDir, 'dist');
const app = express();
const port = Number(process.env.PORT || 4177);
const listenHost = process.env.LISTEN_HOST || '0.0.0.0';
const adminCookieName = 'mini_tally_admin';
const fallbackAdminSessionSecret = process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const adminSessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const minimumWebhookRetryIntervalMs = process.env.NODE_ENV === 'production' ? 30_000 : 1_000;
const webhookRetryIntervalMs = Math.max(minimumWebhookRetryIntervalMs, envNumber('WEBHOOK_RETRY_INTERVAL_MS', 5 * 60 * 1000));
const webhookRetryMaxAttempts = Math.max(1, Math.min(20, envNumber('WEBHOOK_RETRY_MAX_ATTEMPTS', 5)));
const webhookRetryMinAgeMs = Math.max(0, envNumber('WEBHOOK_RETRY_MIN_AGE_MS', 60_000));
const scheduledBackupIntervalHours = Math.max(1, envNumber('BACKUP_INTERVAL_HOURS', 24));
const scheduledBackupRetain = Math.max(1, Math.min(30, envNumber('BACKUP_RETAIN', 7)));

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

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '160mb' }));

const rateLimitBuckets = new Map();

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function rateLimit({ windowMs, max, keyPrefix }) {
  return (req, res, next) => {
    const nowMs = Date.now();
    const key = `${keyPrefix}:${clientIp(req)}`;
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= nowMs) {
      rateLimitBuckets.set(key, { count: 1, resetAt: nowMs + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - nowMs) / 1000)));
      return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }

    return next();
  };
}

setInterval(() => {
  const nowMs = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= nowMs) rateLimitBuckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, keyPrefix: 'auth' });
const submissionLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, keyPrefix: 'submit' });

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

function envNumber(name, fallback) {
  if (!(name in process.env)) return fallback;
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
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

async function getAdminSessionSecret() {
  if (process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET) return fallbackAdminSessionSecret;
  const config = await readAdminConfig();
  return config?.sessionSecret || fallbackAdminSessionSecret;
}

async function signSession(payload) {
  const secret = await getAdminSessionSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

async function verifySession(token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return false;
  const secret = await getAdminSessionSecret();
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
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

async function hasAdminSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifySession(cookies[adminCookieName]);
}

async function requireAdmin(req, res, next) {
  if (await hasAdminSession(req)) return next();
  return res.status(401).json({ message: 'Admin login required' });
}

function publicForm(form) {
  return {
    ...form,
    fields: form.fields.map((field) => ({ ...field })),
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

function cloneForm(source) {
  const clonedId = id('form');
  const cloned = JSON.parse(JSON.stringify(source));
  cloned.id = clonedId;
  cloned.title = `${source.title || 'Untitled form'} copy`.slice(0, 160);
  cloned.published = false;
  cloned.starred = false;
  cloned.createdAt = now();
  cloned.updatedAt = now();
  cloned.settings = normalizeSettings({ ...source.settings, customSlug: '' });
  cloned.theme = normalizeTheme(source.theme);
  cloned.fields = Array.isArray(source.fields) ? source.fields.map(normalizeField) : [];
  return cloned;
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
      const error = validateAttachmentValue(field, value);
      if (error) errors[field.id] = error;
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

function adminResponse(response) {
  return {
    ...response,
    answers: mapAnswerValues(response.answers, withAttachmentDownloadUrls)
  };
}

function publicResponse(response) {
  return {
    ...response,
    answers: mapAnswerValues(response.answers, stripPrivateAttachmentData)
  };
}

function mapAnswerValues(answers, mapper) {
  return Object.fromEntries(Object.entries(answers || {}).map(([key, value]) => [key, mapper(value)]));
}

function filterResponses(responses, form, query, forcedStatus) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 50));
  const search = String(query.search || '').trim().toLowerCase();
  const from = query.from ? new Date(String(query.from)).getTime() : 0;
  const to = query.to ? new Date(String(query.to)).getTime() : 0;
  const status = String(forcedStatus || query.status || 'complete');
  const filtered = responses
    .filter((response) => response.formId === form.id && response.status === status)
    .filter((response) => {
      const created = new Date(response.createdAt).getTime();
      if (from && created < from) return false;
      if (to && created > to + 24 * 60 * 60 * 1000 - 1) return false;
      if (!search) return true;
      const haystack = [
        response.clientId,
        response.createdAt,
        response.updatedAt,
        ...form.fields.map((field) => displayAnswer(response.answers[field.id]))
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = filtered.length;
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
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

async function sendWebhook(form, response, existingLog) {
  if (!form.settings.webhookUrl) return null;
  const attemptAt = now();
  const event = {
    eventId: existingLog?.id || id('evt'),
    eventType: 'FORM_RESPONSE',
    createdAt: attemptAt,
    data: {
      responseId: response.id,
      formId: form.id,
      formName: form.title,
      createdAt: response.createdAt,
      fields: form.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        value: stripPrivateAttachmentData(response.answers[field.id] ?? null)
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
    responseId: response.id,
    url: form.settings.webhookUrl,
    createdAt: existingLog?.createdAt || attemptAt,
    ok: false,
    status: 0,
    message: '',
    attempts: existingLog ? Math.max(1, Number(existingLog.attempts) || 1) + 1 : 1,
    lastAttemptAt: attemptAt
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

async function retryOneWebhook(event, reason = 'auto') {
  const db = await readDb();
  const form = db.forms.find((item) => item.id === event.formId);
  if (!form?.settings?.webhookUrl) return null;
  const response = db.responses.find((item) => item.id === event.responseId && item.formId === form.id);
  if (!response) return null;

  const result = await sendWebhook(form, response, event);
  await updateDb((nextDb) => {
    const eventIndex = nextDb.webhookEvents.findIndex((item) => item.id === result.id && item.formId === result.formId);
    if (eventIndex === -1) nextDb.webhookEvents.push(result);
    else nextDb.webhookEvents[eventIndex] = result;
    return null;
  });
  await audit(reason === 'manual' ? 'webhook.retried' : 'webhook.auto_retried', {
    formId: result.formId,
    targetId: result.id,
    message: `${reason === 'manual' ? 'Retried' : 'Auto retried'} webhook ${result.id}`,
    metadata: { ok: result.ok, status: result.status, attempts: result.attempts }
  });
  return result;
}

async function retryFailedWebhooks() {
  const db = await readDb();
  const cutoff = Date.now() - webhookRetryMinAgeMs;
  const candidates = db.webhookEvents
    .filter((event) => !event.ok && Number(event.attempts || 1) < webhookRetryMaxAttempts)
    .filter((event) => new Date(event.lastAttemptAt || event.createdAt).getTime() <= cutoff)
    .sort((a, b) => (a.lastAttemptAt || a.createdAt).localeCompare(b.lastAttemptAt || b.createdAt))
    .slice(0, 10);
  for (const event of candidates) {
    try {
      await retryOneWebhook(event, 'auto');
    } catch (error) {
      console.error('Automatic webhook retry failed:', error);
    }
  }
}

function startWebhookRetryScheduler() {
  if (process.env.ENABLE_WEBHOOK_RETRY === 'false') return;
  const run = () => retryFailedWebhooks().catch((error) => console.error('Webhook retry scheduler failed:', error));
  const handle = setInterval(run, webhookRetryIntervalMs);
  handle.unref();
  setTimeout(run, Math.min(15_000, webhookRetryIntervalMs)).unref();
}

function startBackupScheduler() {
  if (process.env.ENABLE_SCHEDULED_BACKUPS !== 'true') return;
  const intervalMs = scheduledBackupIntervalHours * 60 * 60 * 1000;
  const run = async () => {
    const event = await createBackup({ reason: 'scheduled', retain: scheduledBackupRetain });
    await audit('backup.scheduled', {
      targetId: event.id,
      message: event.message,
      metadata: { ok: event.ok, path: event.relativePath, size: event.size }
    });
  };
  const handle = setInterval(() => {
    run().catch((error) => console.error('Scheduled backup failed:', error));
  }, intervalMs);
  handle.unref();
  setTimeout(() => {
    run().catch((error) => console.error('Scheduled backup failed:', error));
  }, Math.min(60_000, intervalMs)).unref();
}

function formWebhookEvents(db, formId) {
  return db.webhookEvents
    .filter((event) => event.formId === formId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
}

function configuredSmtp() {
  const host = String(process.env.SMTP_HOST || '').trim();
  if (!host) return null;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  return {
    host,
    port: Number(process.env.SMTP_PORT) || (secure ? 465 : 587),
    secure,
    user: String(process.env.SMTP_USER || ''),
    pass: String(process.env.SMTP_PASS || ''),
    from: String(process.env.SMTP_FROM || process.env.SMTP_USER || 'mini-tally@localhost')
  };
}

function notificationRecipients(value) {
  return String(value || '')
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
    .slice(0, 20);
}

function emailSubject(form) {
  return `New Mini Tally response: ${form.title || 'Untitled form'}`;
}

function emailText(form, response) {
  const lines = [
    `New response for ${form.title || 'Untitled form'}`,
    `Response ID: ${response.id}`,
    `Submitted: ${response.createdAt}`,
    ''
  ];
  for (const field of form.fields || []) {
    lines.push(`${field.label || field.key}: ${displayAnswer(stripPrivateAttachmentData(response.answers[field.id] ?? null))}`);
  }
  return lines.join('\n');
}

function emailData({ from, to, subject, text }) {
  const headers = [
    `From: ${formatEmailHeader(from)}`,
    `To: ${to.map(formatEmailHeader).join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit'
  ];
  return `${headers.join('\r\n')}\r\n\r\n${String(text || '').replace(/\r?\n/g, '\r\n')}\r\n`;
}

function formatEmailHeader(value) {
  return String(value || '').replace(/[\r\n]/g, '').trim();
}

function encodeHeader(value) {
  const text = String(value || '').replace(/[\r\n]/g, '').trim();
  return /^[\x00-\x7F]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

async function smtpSendMail(config, { to, subject, text }) {
  const socket = await openSmtpSocket(config);
  let activeSocket = socket;
  try {
    await expectSmtp(socket, [220]);
    await smtpCommand(socket, `EHLO ${smtpHostName()}`, [250]);
    if (!config.secure && String(process.env.SMTP_STARTTLS || 'true').toLowerCase() !== 'false') {
      await smtpCommand(socket, 'STARTTLS', [220]);
      const secureSocket = tls.connect({ socket, servername: config.host });
      await new Promise((resolve, reject) => {
        secureSocket.once('secureConnect', resolve);
        secureSocket.once('error', reject);
      });
      activeSocket = secureSocket;
      await smtpConversation(secureSocket, config, { to, subject, text });
      return;
    }
    await smtpConversation(socket, config, { to, subject, text });
  } finally {
    activeSocket.destroy();
  }
}

async function smtpConversation(socket, config, { to, subject, text }) {
  if (socket.encrypted) await smtpCommand(socket, `EHLO ${smtpHostName()}`, [250]);
  if (config.user || config.pass) {
    await smtpCommand(socket, 'AUTH LOGIN', [334]);
    await smtpCommand(socket, Buffer.from(config.user).toString('base64'), [334]);
    await smtpCommand(socket, Buffer.from(config.pass).toString('base64'), [235]);
  }
  await smtpCommand(socket, `MAIL FROM:<${smtpAddress(config.from)}>`, [250]);
  for (const recipient of to) {
    await smtpCommand(socket, `RCPT TO:<${smtpAddress(recipient)}>`, [250, 251]);
  }
  await smtpCommand(socket, 'DATA', [354]);
  await smtpCommand(socket, `${emailData({ from: config.from, to, subject, text }).replace(/\r?\n\./g, '\r\n..')}\r\n.`, [250]);
  await smtpCommand(socket, 'QUIT', [221]).catch(() => undefined);
}

function openSmtpSocket(config) {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });
    socket.setTimeout(30_000, () => {
      socket.destroy(new Error('SMTP connection timed out'));
    });
    socket.once('error', reject);
    socket.once(config.secure ? 'secureConnect' : 'connect', () => resolve(socket));
  });
}

function smtpCommand(socket, command, expected) {
  socket.write(`${command}\r\n`);
  return expectSmtp(socket, expected);
}

function expectSmtp(socket, expected) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('SMTP command timed out'));
    };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      const last = lines[lines.length - 1];
      if (!/^\d{3} /.test(last)) return;
      cleanup();
      const code = Number(last.slice(0, 3));
      if (expected.includes(code)) resolve({ code, message: buffer.trim() });
      else reject(new Error(`SMTP error ${code}: ${buffer.trim()}`));
    };
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
  });
}

function smtpAddress(value) {
  const match = String(value || '').match(/<([^>]+)>/);
  return (match ? match[1] : value).replace(/[\r\n<>]/g, '').trim();
}

function smtpHostName() {
  return String(process.env.SMTP_HELO || 'mini-tally.local').replace(/[^a-zA-Z0-9.-]/g, '') || 'mini-tally.local';
}

async function sendEmailNotification(form, response) {
  const to = notificationRecipients(form.settings.emailNotifications);
  if (!to.length) return null;
  const config = configuredSmtp();
  const event = {
    id: id('mail'),
    formId: form.id,
    responseId: response.id,
    to,
    ok: false,
    message: '',
    createdAt: now()
  };

  if (!config) {
    event.message = 'SMTP is not configured';
    await insertEmailEvent(event);
    return event;
  }

  try {
    await smtpSendMail(config, {
      to,
      subject: emailSubject(form),
      text: emailText(form, response)
    });
    event.ok = true;
    event.message = 'Email sent';
  } catch (error) {
    event.message = error.message || 'Email failed';
  }

  await insertEmailEvent(event);
  return event;
}

async function sendEmailNotificationInBackground(form, response) {
  if (!form.settings.emailNotifications) return;
  try {
    const event = await sendEmailNotification(form, response);
    if (event) {
      await audit('email.sent', {
        formId: event.formId,
        targetId: event.responseId,
        message: event.message,
        metadata: { ok: event.ok, to: event.to }
      });
    }
  } catch (error) {
    console.error('Email notification failed:', error);
  }
}

async function audit(action, { formId = '', targetId = '', message = '', metadata = {} } = {}) {
  await insertAuditEvent({ action, formId, targetId, message, metadata, createdAt: now() });
}

app.get('/api/auth/me', async (req, res) => {
  const state = await adminState();
  res.json({
    configured: state.configured,
    authenticated: await hasAdminSession(req),
    setupAllowed: !state.configured && canRunSetup(req)
  });
});

app.post('/api/auth/setup', authLimiter, async (req, res) => {
  const state = await adminState();
  if (state.configured) return res.status(409).json({ message: 'Admin password is already configured' });
  if (!canRunSetup(req)) return res.status(403).json({ message: 'Set ADMIN_PASSWORD or enable setup from the server console' });
  const password = String(req.body.password || '');
  if (password.length < 10) return res.status(400).json({ message: 'Use at least 10 characters' });

  const sessionSecret = crypto.randomBytes(32).toString('base64url');
  await writeAdminConfig({ passwordHash: await hashPassword(password), sessionSecret, createdAt: now() });
  const token = await signSession({ role: 'admin', exp: Date.now() + adminSessionTtlMs });
  setAdminCookie(res, token, Math.floor(adminSessionTtlMs / 1000));
  res.status(201).json({ ok: true });
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const state = await adminState();
  if (!state.configured) return res.status(409).json({ message: 'Admin password is not configured' });
  if (!(await isAdminPassword(req.body.password))) return res.status(401).json({ message: 'Incorrect password' });

  const token = await signSession({ role: 'admin', exp: Date.now() + adminSessionTtlMs });
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
  await insertFormVersion(form, 'created');
  await audit('form.created', { formId: form.id, targetId: form.id, message: `Created form "${form.title}"` });
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
  await insertFormVersion(form, 'updated');
  await audit('form.updated', { formId: form.id, targetId: form.id, message: `Updated form "${form.title}"` });
  res.json(form);
});

app.post('/api/forms/:id/clone', requireAdmin, async (req, res) => {
  const result = await updateDb((db) => {
    const source = findForm(db, req.params.id);
    if (!source) return { error: 'Form not found', status: 404 };
    const cloned = cloneForm(source);
    db.forms.push(cloned);
    return { source, cloned };
  });
  if (result.error) return res.status(result.status).json({ message: result.error });
  await insertFormVersion(result.cloned, 'cloned');
  await audit('form.cloned', {
    formId: result.cloned.id,
    targetId: result.source.id,
    message: `Cloned "${result.source.title}" to "${result.cloned.title}"`,
    metadata: { sourceFormId: result.source.id }
  });
  res.status(201).json(result.cloned);
});

app.delete('/api/forms/:id', requireAdmin, async (req, res) => {
  const deleted = await updateDb((db) => {
    const form = db.forms.find((item) => item.id === req.params.id);
    db.forms = db.forms.filter((item) => item.id !== req.params.id);
    db.responses = db.responses.filter((item) => item.formId !== req.params.id);
    return form || null;
  });
  if (deleted) await audit('form.deleted', { formId: deleted.id, targetId: deleted.id, message: `Deleted form "${deleted.title}"` });
  res.status(204).end();
});

app.get('/api/forms/:id/versions', requireAdmin, async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  const versions = await listFormVersions(form.id);
  res.json(versions.map(({ snapshot, ...version }) => ({
    ...version,
    title: snapshot?.title || '',
    fieldCount: Array.isArray(snapshot?.fields) ? snapshot.fields.length : 0
  })));
});

app.post('/api/forms/:id/versions/:versionId/restore', requireAdmin, async (req, res) => {
  const version = await getFormVersion(req.params.id, req.params.versionId);
  if (!version?.snapshot) return res.status(404).json({ message: 'Version not found' });
  const form = await updateDb((db) => {
    const index = db.forms.findIndex((item) => item.id === req.params.id);
    if (index === -1) return { error: 'Form not found', status: 404 };
    const restored = normalizeForm(
      {
        ...version.snapshot,
        id: req.params.id,
        settings: { ...version.snapshot.settings, customSlug: db.forms[index].settings.customSlug }
      },
      db.forms[index]
    );
    restored.createdAt = db.forms[index].createdAt;
    restored.updatedAt = now();
    db.forms[index] = restored;
    return restored;
  });
  if (form.error) return res.status(form.status).json({ message: form.error });
  await insertFormVersion(form, 'restored');
  await audit('form.version_restored', {
    formId: form.id,
    targetId: version.id,
    message: `Restored "${form.title}" from ${version.createdAt}`,
    metadata: { versionId: version.id }
  });
  res.json(form);
});

app.post('/api/forms/:id/partials', submissionLimiter, async (req, res) => {
  const result = await updateDb(async (db) => {
    const form = findForm(db, req.params.id);
    if (!form || !form.published || !form.settings.partialSubmissions) return { error: 'Partial submissions disabled', status: 404 };
    const answers = calculateFields(form, req.body.answers || {});
    const clientId = String(req.body.clientId || '');
    if (!clientId || Object.keys(answers).length === 0) return { empty: true };

    const existing = db.responses.find((item) => item.formId === form.id && item.clientId === clientId && item.status === 'partial');
    if (existing) {
      existing.updatedAt = now();
      existing.answers = await materializeAnswers(form, existing, { ...existing.answers, ...answers });
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
    response.answers = await materializeAnswers(form, response, response.answers);
    db.responses.push(response);
    return { response, status: 201 };
  });
  if (result?.error) return res.status(result.status).json({ message: result.error });
  if (result?.empty) return res.status(204).end();
  if (result.response) return res.status(result.status).json(publicResponse(result.response));
});

app.post('/api/forms/:id/responses', submissionLimiter, async (req, res) => {
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
    response.answers = await materializeAnswers(form, response, response.answers);
    db.responses.push(response);
    const webhookForm = form.settings.webhookUrl ? JSON.parse(JSON.stringify(form)) : null;
    const emailForm = form.settings.emailNotifications ? JSON.parse(JSON.stringify(form)) : null;
    return { response, status: 201, webhookForm, emailForm };
  });
  if (result.error) return res.status(result.status).json({ message: result.error });
  if (result.errors) return res.status(result.status).json({ errors: result.errors });
  res.status(result.status).json(publicResponse(result.response));
  void audit('response.created', {
    formId: result.response.formId,
    targetId: result.response.id,
    message: `New response ${result.response.id}`,
    metadata: { clientId: result.response.clientId }
  }).catch((error) => console.error('Audit log failed:', error));
  if (result.webhookForm) void sendWebhookInBackground(result.webhookForm, result.response);
  if (result.emailForm) void sendEmailNotificationInBackground(result.emailForm, result.response);
});

app.get('/api/forms/:id/responses', requireAdmin, async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  res.json(filterResponses(db.responses, form, req.query, 'complete').items.map(adminResponse));
});

app.get('/api/forms/:id/partials', requireAdmin, async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  res.json(filterResponses(db.responses, form, req.query, 'partial').items.map(adminResponse));
});

app.get('/api/forms/:id/responses/page', requireAdmin, async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  const result = filterResponses(db.responses, form, req.query, req.query.status || 'complete');
  res.json({ ...result, items: result.items.map(adminResponse) });
});

app.get('/api/forms/:id/webhooks', requireAdmin, async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  res.json(formWebhookEvents(db, form.id));
});

app.get('/api/forms/:id/emails', requireAdmin, async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  const events = await listEmailEvents({ formId: form.id, limit: req.query.limit || 100 });
  res.json(events);
});

app.post('/api/forms/:id/webhooks/:eventId/retry', requireAdmin, async (req, res) => {
  const db = await readDb();
  const form = findForm(db, req.params.id);
  if (!form) return res.status(404).json({ message: 'Form not found' });
  const event = db.webhookEvents.find((item) => item.id === req.params.eventId && item.formId === form.id);
  if (!event) return res.status(404).json({ message: 'Webhook event not found' });
  const response = db.responses.find((item) => item.id === event.responseId && item.formId === form.id);
  if (!response) return res.status(404).json({ message: 'Response not found' });
  if (!form.settings.webhookUrl) return res.status(400).json({ message: 'Webhook URL is not configured' });

  const result = await retryOneWebhook(event, 'manual');
  if (result.error) return res.status(result.status).json({ message: result.error });
  res.json(result);
});

app.get('/api/audit-events', requireAdmin, async (req, res) => {
  const events = await listAuditEvents({ formId: String(req.query.formId || ''), limit: req.query.limit });
  res.json(events);
});

app.get('/api/maintenance/backups', requireAdmin, async (req, res) => {
  const events = await listMaintenanceEvents({ kind: 'backup', limit: req.query.limit || 50 });
  res.json(events);
});

app.post('/api/maintenance/backups/run', requireAdmin, async (_req, res) => {
  const event = await createBackup({ reason: 'manual', retain: scheduledBackupRetain });
  await audit('backup.created', {
    targetId: event.id,
    message: event.message,
    metadata: { ok: event.ok, path: event.relativePath, size: event.size }
  });
  res.status(event.ok ? 201 : 500).json(event);
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

app.get('/api/attachments/:id', requireAdmin, async (req, res) => {
  const attachment = await getAttachment(req.params.id);
  if (!attachment) return res.status(404).json({ message: 'Attachment not found' });
  const absolutePath = getUploadAbsolutePath(attachment.relativePath);
  if (!absolutePath) return res.status(404).json({ message: 'Attachment not found' });
  try {
    await fs.access(absolutePath);
  } catch {
    return res.status(404).json({ message: 'Attachment not found' });
  }
  res.setHeader('Content-Type', attachment.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${String(attachment.name || 'attachment').replaceAll('"', '')}"`);
  res.sendFile(absolutePath);
});

async function configureStaticRoutes() {
  try {
    await fs.access(distDir);
    app.use(express.static(distDir));
    app.use((req, res) => {
      if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'API route not found' });
      return res.sendFile(path.join(distDir, 'index.html'));
    });
  } catch {
    app.get('/', (_req, res) => {
      res.send('Mini Tally API is running. Start the Vite dev server with npm run dev.');
    });
    app.use((req, res) => {
      if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'API route not found' });
      return res.status(404).send('Mini Tally frontend is not built. Run npm run build.');
    });
  }
}

app.use((error, req, res, next) => {
  if (!req.path.startsWith('/api/')) return next(error);
  console.error('API error:', error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

async function start() {
  await ensureStore();
  startWebhookRetryScheduler();
  startBackupScheduler();
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
