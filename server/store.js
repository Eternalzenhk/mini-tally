import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
export const dataDir = path.join(rootDir, 'data');
export const sqlitePath = path.join(dataDir, 'mini-tally.sqlite');
export const legacyFormsPath = path.join(dataDir, 'forms.json');
export const legacyAdminPath = path.join(dataDir, 'admin.json');
export const uploadsDir = path.join(dataDir, 'uploads');
export const backupsDir = path.join(dataDir, 'backups');

let database;
let initPromise;
let dbQueue = Promise.resolve();

const allowedFileExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.zip']);
const allowedFileMimes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed'
]);

export function getUploadAbsolutePath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!normalized.startsWith('uploads/')) return '';
  const resolved = path.resolve(dataDir, normalized);
  return resolved.startsWith(path.resolve(uploadsDir)) ? resolved : '';
}

export async function ensureStore() {
  if (!initPromise) {
    initPromise = initializeStore();
  }
  await initPromise;
}

async function initializeStore() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(backupsDir, { recursive: true });
  database = new DatabaseSync(sqlitePath);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec(`
    CREATE TABLE IF NOT EXISTS forms (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 0,
      starred INTEGER NOT NULL DEFAULT 0,
      settings_json TEXT NOT NULL,
      theme_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fields (
      id TEXT NOT NULL,
      form_id TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      placeholder TEXT NOT NULL DEFAULT '',
      default_value TEXT NOT NULL DEFAULT '',
      options_json TEXT NOT NULL DEFAULT '[]',
      rows_json TEXT NOT NULL DEFAULT '[]',
      columns_json TEXT NOT NULL DEFAULT '[]',
      min_value REAL NOT NULL DEFAULT 0,
      max_value REAL NOT NULL DEFAULT 10,
      step_value REAL NOT NULL DEFAULT 1,
      formula TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT '',
      visibility_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (form_id, id),
      FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      client_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS answers (
      response_id TEXT NOT NULL,
      field_id TEXT NOT NULL,
      value_json TEXT NOT NULL,
      PRIMARY KEY (response_id, field_id),
      FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      response_id TEXT NOT NULL,
      field_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      relative_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      response_id TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      ok INTEGER NOT NULL DEFAULT 0,
      status INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 1,
      last_attempt_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS form_versions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      form_id TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_events (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL DEFAULT '',
      response_id TEXT NOT NULL DEFAULT '',
      to_json TEXT NOT NULL DEFAULT '[]',
      ok INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT '',
      ok INTEGER NOT NULL DEFAULT 0,
      relative_path TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT,
      session_secret TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_fields_form_sort ON fields(form_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_responses_form_status_created ON responses(form_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_attachments_response ON attachments(response_id);
    CREATE INDEX IF NOT EXISTS idx_form_versions_form_created ON form_versions(form_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_events_form_created ON audit_events(form_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_email_events_form_created ON email_events(form_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_maintenance_events_kind_created ON maintenance_events(kind, created_at);
  `);
  ensureColumn('webhook_events', 'attempts', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('webhook_events', 'last_attempt_at', 'TEXT');

  await migrateLegacyFormsIfNeeded();
  await migrateLegacyAdminIfNeeded();
}

function ensureColumn(table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((item) => item.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function migrateLegacyFormsIfNeeded() {
  const existing = database.prepare('SELECT COUNT(*) AS count FROM forms').get();
  if (Number(existing?.count || 0) > 0 || !fsSync.existsSync(legacyFormsPath)) return;

  const raw = (await fs.readFile(legacyFormsPath, 'utf8')).replace(/^\uFEFF/, '');
  const legacy = JSON.parse(raw);
  const data = {
    forms: Array.isArray(legacy.forms) ? legacy.forms : [],
    responses: Array.isArray(legacy.responses) ? legacy.responses : [],
    webhookEvents: Array.isArray(legacy.webhookEvents) ? legacy.webhookEvents : []
  };
  await materializeAllAttachments(data);
  writeDbToSqlite(data);

  const stamp = timestampForFile();
  await fs.copyFile(legacyFormsPath, `${legacyFormsPath}.migrated-${stamp}.bak`);
}

async function migrateLegacyAdminIfNeeded() {
  const existing = database.prepare('SELECT password_hash FROM admin_config WHERE id = 1').get();
  if (existing?.password_hash || !fsSync.existsSync(legacyAdminPath)) return;

  const raw = (await fs.readFile(legacyAdminPath, 'utf8')).replace(/^\uFEFF/, '');
  const config = JSON.parse(raw);
  if (!config?.passwordHash) return;
  database
    .prepare(
      `INSERT OR REPLACE INTO admin_config (id, password_hash, session_secret, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?)`
    )
    .run(config.passwordHash, config.sessionSecret || crypto.randomBytes(32).toString('base64url'), config.createdAt || now(), config.updatedAt || now());
}

export async function readDb() {
  await ensureStore();
  return readDbFromSqlite();
}

export async function writeDb(data) {
  await ensureStore();
  await materializeAllAttachments(data);
  writeDbToSqlite(data);
}

export function updateDb(mutator) {
  const next = dbQueue.then(async () => {
    await ensureStore();
    const db = readDbFromSqlite();
    const result = await mutator(db);
    await materializeAllAttachments(db);
    writeDbToSqlite(db);
    return result;
  });
  dbQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function readAdminConfig() {
  await ensureStore();
  const row = database.prepare('SELECT password_hash, session_secret, created_at, updated_at FROM admin_config WHERE id = 1').get();
  if (!row?.password_hash) return null;
  return {
    passwordHash: row.password_hash,
    sessionSecret: row.session_secret,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function writeAdminConfig(config) {
  await ensureStore();
  const existing = database.prepare('SELECT session_secret, created_at FROM admin_config WHERE id = 1').get();
  const sessionSecret = config.sessionSecret || existing?.session_secret || crypto.randomBytes(32).toString('base64url');
  const createdAt = config.createdAt || existing?.created_at || now();
  const updatedAt = config.updatedAt || now();
  database
    .prepare(
      `INSERT OR REPLACE INTO admin_config (id, password_hash, session_secret, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?)`
    )
    .run(config.passwordHash || null, sessionSecret, createdAt, updatedAt);
}

export async function getAttachment(id) {
  await ensureStore();
  return database
    .prepare('SELECT id, response_id AS responseId, field_id AS fieldId, name, mime, size, relative_path AS relativePath, created_at AS createdAt FROM attachments WHERE id = ?')
    .get(id);
}

export async function insertFormVersion(form, action = 'saved') {
  await ensureStore();
  database
    .prepare('INSERT INTO form_versions (id, form_id, action, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id('ver'), form.id, action, stringifyJson(form), now());
}

export async function listFormVersions(formId, limit = 30) {
  await ensureStore();
  return database
    .prepare('SELECT id, form_id AS formId, action, snapshot_json AS snapshotJson, created_at AS createdAt FROM form_versions WHERE form_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(formId, Math.max(1, Math.min(100, Number(limit) || 30)))
    .map((row) => ({
      id: row.id,
      formId: row.formId,
      action: row.action || '',
      snapshot: parseJson(row.snapshotJson, null),
      createdAt: row.createdAt
    }));
}

export async function getFormVersion(formId, versionId) {
  await ensureStore();
  const row = database
    .prepare('SELECT id, form_id AS formId, action, snapshot_json AS snapshotJson, created_at AS createdAt FROM form_versions WHERE form_id = ? AND id = ?')
    .get(formId, versionId);
  if (!row) return null;
  return {
    id: row.id,
    formId: row.formId,
    action: row.action || '',
    snapshot: parseJson(row.snapshotJson, null),
    createdAt: row.createdAt
  };
}

export async function insertAuditEvent(event) {
  await ensureStore();
  database
    .prepare('INSERT INTO audit_events (id, action, form_id, target_id, message, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(
      event.id || id('aud'),
      event.action || 'event',
      event.formId || '',
      event.targetId || '',
      event.message || '',
      stringifyJson(event.metadata || {}),
      event.createdAt || now()
    );
}

export async function listAuditEvents({ formId = '', limit = 100 } = {}) {
  await ensureStore();
  const cappedLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const rows = formId
    ? database
        .prepare('SELECT id, action, form_id AS formId, target_id AS targetId, message, metadata_json AS metadataJson, created_at AS createdAt FROM audit_events WHERE form_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(formId, cappedLimit)
    : database
        .prepare('SELECT id, action, form_id AS formId, target_id AS targetId, message, metadata_json AS metadataJson, created_at AS createdAt FROM audit_events ORDER BY created_at DESC LIMIT ?')
        .all(cappedLimit);
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    formId: row.formId || '',
    targetId: row.targetId || '',
    message: row.message || '',
    metadata: parseJson(row.metadataJson, {}),
    createdAt: row.createdAt
  }));
}

export async function insertEmailEvent(event) {
  await ensureStore();
  database
    .prepare('INSERT INTO email_events (id, form_id, response_id, to_json, ok, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(
      event.id,
      event.formId || '',
      event.responseId || '',
      stringifyJson(Array.isArray(event.to) ? event.to : []),
      event.ok ? 1 : 0,
      event.message || '',
      event.createdAt || now()
    );
}

export async function listEmailEvents({ formId = '', limit = 100 } = {}) {
  await ensureStore();
  const cappedLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const rows = formId
    ? database
        .prepare('SELECT id, form_id AS formId, response_id AS responseId, to_json AS toJson, ok, message, created_at AS createdAt FROM email_events WHERE form_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(formId, cappedLimit)
    : database
        .prepare('SELECT id, form_id AS formId, response_id AS responseId, to_json AS toJson, ok, message, created_at AS createdAt FROM email_events ORDER BY created_at DESC LIMIT ?')
        .all(cappedLimit);
  return rows.map((row) => ({
    id: row.id,
    formId: row.formId || '',
    responseId: row.responseId || '',
    to: parseJson(row.toJson, []),
    ok: Boolean(row.ok),
    message: row.message || '',
    createdAt: row.createdAt
  }));
}

export async function insertMaintenanceEvent(event) {
  await ensureStore();
  database
    .prepare('INSERT INTO maintenance_events (id, kind, ok, relative_path, size, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(
      event.id,
      event.kind || 'backup',
      event.ok ? 1 : 0,
      event.relativePath || '',
      Number(event.size) || 0,
      event.message || '',
      event.createdAt || now()
    );
}

export async function listMaintenanceEvents({ kind = '', limit = 50 } = {}) {
  await ensureStore();
  const cappedLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const rows = kind
    ? database
        .prepare('SELECT id, kind, ok, relative_path AS relativePath, size, message, created_at AS createdAt FROM maintenance_events WHERE kind = ? ORDER BY created_at DESC LIMIT ?')
        .all(kind, cappedLimit)
    : database
        .prepare('SELECT id, kind, ok, relative_path AS relativePath, size, message, created_at AS createdAt FROM maintenance_events ORDER BY created_at DESC LIMIT ?')
        .all(cappedLimit);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind || '',
    ok: Boolean(row.ok),
    relativePath: row.relativePath || '',
    size: Number(row.size) || 0,
    message: row.message || '',
    createdAt: row.createdAt
  }));
}

export async function createBackup({ reason = 'manual', retain = 7 } = {}) {
  await ensureStore();
  const createdAt = now();
  const backupName = `backup-${timestampForFile()}`;
  const targetDir = path.join(backupsDir, backupName);
  const relativePath = path.posix.join('backups', backupName);
  let event;

  try {
    await fs.mkdir(targetDir, { recursive: false });
    database.exec('PRAGMA wal_checkpoint(FULL)');

    const files = [sqlitePath, `${sqlitePath}-wal`, `${sqlitePath}-shm`, legacyAdminPath, legacyFormsPath];
    for (const source of files) {
      if (!fsSync.existsSync(source)) continue;
      await fs.copyFile(source, path.join(targetDir, path.basename(source)));
    }

    if (fsSync.existsSync(uploadsDir)) {
      await fs.cp(uploadsDir, path.join(targetDir, 'uploads'), { recursive: true, force: true });
    }

    const size = await directorySize(targetDir);
    event = {
      id: id('mnt'),
      kind: 'backup',
      ok: true,
      relativePath,
      size,
      message: `${reason} backup completed`,
      createdAt
    };
    await insertMaintenanceEvent(event);
    await pruneBackups(retain);
  } catch (error) {
    event = {
      id: id('mnt'),
      kind: 'backup',
      ok: false,
      relativePath,
      size: 0,
      message: error.message || 'Backup failed',
      createdAt
    };
    await insertMaintenanceEvent(event);
  }

  return event;
}

export async function restoreBackup(backupId) {
  await ensureStore();
  const source = database
    .prepare('SELECT id, relative_path AS relativePath FROM maintenance_events WHERE id = ? AND kind = ? AND ok = 1')
    .get(backupId, 'backup');
  if (!source) {
    const failed = {
      id: id('mnt'),
      kind: 'restore',
      ok: false,
      relativePath: '',
      size: 0,
      message: 'Backup not found',
      createdAt: now()
    };
    await insertMaintenanceEvent(failed);
    return failed;
  }

  const backupPath = backupAbsolutePath(source.relativePath);
  if (!backupPath || !fsSync.existsSync(path.join(backupPath, 'mini-tally.sqlite'))) {
    const failed = {
      id: id('mnt'),
      kind: 'restore',
      ok: false,
      relativePath: source.relativePath,
      size: 0,
      message: 'Backup files are missing',
      createdAt: now()
    };
    await insertMaintenanceEvent(failed);
    return failed;
  }

  const safetyBackup = await createBackup({ reason: 'pre-restore', retain: 14 });
  if (!safetyBackup.ok) {
    const failed = {
      id: id('mnt'),
      kind: 'restore',
      ok: false,
      relativePath: source.relativePath,
      size: 0,
      message: `Safety backup failed: ${safetyBackup.message || 'unknown error'}`,
      createdAt: now()
    };
    await insertMaintenanceEvent(failed);
    return failed;
  }

  const event = {
    id: id('mnt'),
    kind: 'restore',
    ok: false,
    relativePath: source.relativePath,
    size: 0,
    message: '',
    createdAt: now()
  };

  try {
    database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    database.close();
    database = undefined;
    initPromise = undefined;

    await replaceFileFromBackup(backupPath, 'mini-tally.sqlite', sqlitePath, true);
    await replaceFileFromBackup(backupPath, 'mini-tally.sqlite-wal', `${sqlitePath}-wal`, false);
    await replaceFileFromBackup(backupPath, 'mini-tally.sqlite-shm', `${sqlitePath}-shm`, false);
    await replaceFileFromBackup(backupPath, 'admin.json', legacyAdminPath, false);
    await replaceFileFromBackup(backupPath, 'forms.json', legacyFormsPath, false);

    await fs.rm(uploadsDir, { recursive: true, force: true });
    if (fsSync.existsSync(path.join(backupPath, 'uploads'))) {
      await fs.cp(path.join(backupPath, 'uploads'), uploadsDir, { recursive: true, force: true });
    } else {
      await fs.mkdir(uploadsDir, { recursive: true });
    }

    await ensureStore();
    event.ok = true;
    event.size = await directorySize(backupPath);
    event.message = `Restored ${source.relativePath}; safety backup ${safetyBackup.relativePath}`;
  } catch (error) {
    initPromise = undefined;
    await ensureStore();
    event.message = error.message || 'Restore failed';
  }

  await insertMaintenanceEvent(event);
  return event;
}

function backupAbsolutePath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!normalized.startsWith('backups/backup-')) return '';
  const resolved = path.resolve(dataDir, normalized);
  return resolved.startsWith(path.resolve(backupsDir)) ? resolved : '';
}

async function replaceFileFromBackup(backupPath, backupName, destination, required) {
  const source = path.join(backupPath, backupName);
  if (!fsSync.existsSync(source)) {
    await fs.rm(destination, { force: true });
    if (required) throw new Error(`${backupName} is missing`);
    return;
  }
  const tempPath = `${destination}.restore-${Date.now()}.tmp`;
  await fs.copyFile(source, tempPath);
  await fs.rename(tempPath, destination);
}

async function pruneBackups(retain) {
  const keep = Math.max(1, Math.min(30, Number(retain) || 7));
  const entries = await fs.readdir(backupsDir, { withFileTypes: true }).catch(() => []);
  const backups = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('backup-'))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const name of backups.slice(keep)) {
    await fs.rm(path.join(backupsDir, name), { recursive: true, force: true });
  }
}

async function directorySize(target) {
  let total = 0;
  const entries = await fs.readdir(target, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(target, entry.name);
    if (entry.isDirectory()) total += await directorySize(fullPath);
    else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      total += stat.size;
    }
  }
  return total;
}

function readDbFromSqlite() {
  const forms = database
    .prepare('SELECT id, title, description, published, starred, settings_json, theme_json, created_at, updated_at FROM forms ORDER BY updated_at DESC')
    .all()
    .map((row) => {
      const fields = database
        .prepare('SELECT * FROM fields WHERE form_id = ? ORDER BY sort_order ASC')
        .all(row.id)
        .map(fieldFromRow);
      return {
        id: row.id,
        title: row.title,
        description: row.description || '',
        published: Boolean(row.published),
        starred: Boolean(row.starred),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        fields,
        settings: parseJson(row.settings_json, {}),
        theme: parseJson(row.theme_json, {})
      };
    });

  const attachments = database.prepare('SELECT * FROM attachments').all();
  const attachmentsByResponseField = new Map();
  for (const item of attachments) {
    const key = `${item.response_id}:${item.field_id}`;
    if (!attachmentsByResponseField.has(key)) attachmentsByResponseField.set(key, []);
    attachmentsByResponseField.get(key).push(attachmentFromRow(item));
  }

  const responses = database
    .prepare('SELECT id, form_id, client_id, status, created_at, updated_at FROM responses ORDER BY created_at DESC')
    .all()
    .map((row) => {
      const answers = {};
      const answerRows = database.prepare('SELECT field_id, value_json FROM answers WHERE response_id = ?').all(row.id);
      for (const answer of answerRows) {
        const parsed = parseJson(answer.value_json, null);
        answers[answer.field_id] = mergeAttachmentMetadata(parsed, attachmentsByResponseField.get(`${row.id}:${answer.field_id}`) || []);
      }
      return {
        id: row.id,
        formId: row.form_id,
        clientId: row.client_id || '',
        answers,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

  const webhookEvents = database
    .prepare('SELECT id, form_id, response_id, url, ok, status, message, attempts, last_attempt_at, created_at FROM webhook_events ORDER BY created_at DESC')
    .all()
    .map((row) => ({
      id: row.id,
      formId: row.form_id,
      responseId: row.response_id || '',
      url: row.url || '',
      ok: Boolean(row.ok),
      status: Number(row.status) || 0,
      message: row.message || '',
      attempts: Number(row.attempts) || 1,
      lastAttemptAt: row.last_attempt_at || row.created_at,
      createdAt: row.created_at
    }));

  return { forms, responses, webhookEvents };
}

function writeDbToSqlite(data) {
  runTransaction((nextData) => {
    database.exec('DELETE FROM answers; DELETE FROM attachments; DELETE FROM responses; DELETE FROM fields; DELETE FROM forms; DELETE FROM webhook_events;');

    const insertForm = database.prepare(
      `INSERT INTO forms (id, title, description, published, starred, settings_json, theme_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertField = database.prepare(
      `INSERT INTO fields (
        id, form_id, key, label, type, required, description, placeholder, default_value,
        options_json, rows_json, columns_json, min_value, max_value, step_value,
        formula, price, currency, visibility_json, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertResponse = database.prepare(
      `INSERT INTO responses (id, form_id, client_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertAnswer = database.prepare('INSERT INTO answers (response_id, field_id, value_json) VALUES (?, ?, ?)');
    const insertAttachment = database.prepare(
      `INSERT INTO attachments (id, response_id, field_id, name, mime, size, relative_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertWebhook = database.prepare(
      `INSERT INTO webhook_events (id, form_id, response_id, url, ok, status, message, attempts, last_attempt_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const form of nextData.forms || []) {
      insertForm.run(
        form.id,
        form.title || 'Untitled form',
        form.description || '',
        form.published ? 1 : 0,
        form.starred ? 1 : 0,
        stringifyJson(form.settings || {}),
        stringifyJson(form.theme || {}),
        form.createdAt || now(),
        form.updatedAt || form.createdAt || now()
      );
      (form.fields || []).forEach((field, index) => {
        insertField.run(
          field.id,
          form.id,
          field.key || field.id,
          field.label || '',
          field.type || 'short_text',
          field.required ? 1 : 0,
          field.description || '',
          field.placeholder || '',
          field.defaultValue || '',
          stringifyJson(field.options || []),
          stringifyJson(field.rows || []),
          stringifyJson(field.columns || []),
          Number(field.min) || 0,
          Number(field.max) || 0,
          Number(field.step) || 1,
          field.formula || '',
          Number(field.price) || 0,
          field.currency || '',
          field.visibility ? stringifyJson(field.visibility) : null,
          index
        );
      });
    }

    for (const response of nextData.responses || []) {
      insertResponse.run(response.id, response.formId, response.clientId || '', response.status || 'complete', response.createdAt || now(), response.updatedAt || response.createdAt || now());
      for (const [fieldId, value] of Object.entries(response.answers || {})) {
        insertAnswer.run(response.id, fieldId, stringifyJson(stripDownloadUrls(value)));
        for (const attachment of attachmentsFromValue(value)) {
          if (!attachment.relativePath) continue;
          insertAttachment.run(
            attachment.attachmentId || attachment.id,
            response.id,
            fieldId,
            attachment.name || 'attachment',
            attachment.type || attachment.mime || '',
            Number(attachment.size) || 0,
            attachment.relativePath,
            attachment.createdAt || response.createdAt || now()
          );
        }
      }
    }

    for (const event of nextData.webhookEvents || []) {
      insertWebhook.run(
        event.id,
        event.formId || '',
        event.responseId || '',
        event.url || '',
        event.ok ? 1 : 0,
        Number(event.status) || 0,
        event.message || '',
        Math.max(1, Number(event.attempts) || 1),
        event.lastAttemptAt || event.createdAt || now(),
        event.createdAt || now()
      );
    }
  }, data || { forms: [], responses: [], webhookEvents: [] });
}

function runTransaction(callback, value) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = callback(value);
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

async function materializeAllAttachments(data) {
  const formsById = new Map((data.forms || []).map((form) => [form.id, form]));
  for (const response of data.responses || []) {
    const form = formsById.get(response.formId);
    if (!form) continue;
    response.answers = await materializeAnswers(form, response, response.answers || {});
  }
}

export async function materializeAnswers(form, response, answers) {
  const nextAnswers = { ...answers };
  for (const field of form.fields || []) {
    if (!['file_upload', 'signature'].includes(field.type)) continue;
    if (!(field.id in nextAnswers)) continue;
    nextAnswers[field.id] = await materializeFileValue(form, response, field, nextAnswers[field.id]);
  }
  return nextAnswers;
}

async function materializeFileValue(form, response, field, value) {
  if (!value) return value;
  if (Array.isArray(value)) {
    const files = [];
    for (const item of value) {
      const next = await materializeOneFile(form, response, field, item);
      if (next) files.push(next);
    }
    return files;
  }
  return materializeOneFile(form, response, field, value);
}

async function materializeOneFile(form, response, field, value) {
  if (!isObject(value)) return value;
  if (!value.dataUrl) return value;
  const decoded = decodeDataUrl(value.dataUrl);
  const name = sanitizeFileName(value.name || 'attachment');
  const mime = String(value.type || decoded.mime || mimeFromName(name) || '');
  const size = decoded.buffer.length;
  assertAllowedAttachment(field, { name, mime, size });

  const attachmentId = value.attachmentId || id('att');
  const safeName = `${attachmentId}-${name}`;
  const relativePath = path.posix.join('uploads', form.id, response.id, safeName);
  const absolutePath = getUploadAbsolutePath(relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, decoded.buffer, { flag: 'wx' }).catch(async (error) => {
    if (error?.code !== 'EEXIST') throw error;
  });

  return {
    attachmentId,
    name: value.name || name,
    type: mime,
    size,
    relativePath,
    createdAt: response.createdAt || now()
  };
}

export function validateAttachmentValue(field, value) {
  const files = Array.isArray(value) ? value : value ? [value] : [];
  if (files.length > 10) return 'Upload up to 10 files';
  for (const file of files) {
    if (!isObject(file)) continue;
    let size = Number(file.size) || 0;
    let mime = String(file.type || '');
    const name = String(file.name || '');
    try {
      if (file.dataUrl) {
        const decoded = decodeDataUrl(file.dataUrl);
        size = decoded.buffer.length;
        mime = mime || decoded.mime;
      }
      assertAllowedAttachment(field, { name, mime, size });
    } catch (error) {
      return error.message;
    }
  }
  return '';
}

function assertAllowedAttachment(field, file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Each file must be 10 MB or smaller');
  if (field.type === 'signature' && !String(file.mime || '').startsWith('image/')) throw new Error('Signature uploads must be images');
  const extension = path.extname(file.name || '').toLowerCase();
  const mime = String(file.mime || '').toLowerCase();
  const allowed = mime.startsWith('image/') || allowedFileMimes.has(mime) || allowedFileExtensions.has(extension);
  if (!allowed) throw new Error('File type is not allowed');
}

function fieldFromRow(row) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type,
    required: Boolean(row.required),
    description: row.description || '',
    placeholder: row.placeholder || '',
    defaultValue: row.default_value || '',
    options: parseJson(row.options_json, []),
    rows: parseJson(row.rows_json, []),
    columns: parseJson(row.columns_json, []),
    min: Number(row.min_value),
    max: Number(row.max_value),
    step: Number(row.step_value),
    formula: row.formula || '',
    price: Number(row.price) || 0,
    currency: row.currency || '',
    visibility: row.visibility_json ? parseJson(row.visibility_json, undefined) : undefined
  };
}

function attachmentFromRow(row) {
  return {
    attachmentId: row.id,
    name: row.name,
    type: row.mime || '',
    size: Number(row.size) || 0,
    relativePath: row.relative_path,
    createdAt: row.created_at
  };
}

function mergeAttachmentMetadata(value, attachments) {
  if (!attachments.length) return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!isObject(item)) return item;
      const attachment = attachments.find((next) => next.attachmentId === item.attachmentId || next.name === item.name);
      return attachment ? { ...item, ...attachment } : item;
    });
  }
  if (isObject(value)) {
    const attachment = attachments.find((next) => next.attachmentId === value.attachmentId || next.name === value.name);
    return attachment ? { ...value, ...attachment } : value;
  }
  return value;
}

export function withAttachmentDownloadUrls(value) {
  if (Array.isArray(value)) return value.map(withAttachmentDownloadUrls);
  if (isObject(value) && value.attachmentId) {
    return { ...value, downloadUrl: `/api/attachments/${encodeURIComponent(value.attachmentId)}` };
  }
  return value;
}

export function stripPrivateAttachmentData(value) {
  if (Array.isArray(value)) return value.map(stripPrivateAttachmentData);
  if (isObject(value)) {
    const { attachmentId, relativePath, dataUrl, downloadUrl, ...rest } = value;
    return rest;
  }
  return value;
}

function stripDownloadUrls(value) {
  if (Array.isArray(value)) return value.map(stripDownloadUrls);
  if (isObject(value)) {
    const { downloadUrl, dataUrl, ...rest } = value;
    return rest;
  }
  return value;
}

function attachmentsFromValue(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter((item) => isObject(item) && item.attachmentId && item.relativePath);
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?;base64,(.*)$/);
  if (!match) throw new Error('Invalid file upload data');
  return {
    mime: match[1] || '',
    buffer: Buffer.from(match[2], 'base64')
  };
}

function sanitizeFileName(name) {
  const cleaned = String(name || 'attachment')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'attachment';
}

function mimeFromName(name) {
  const ext = path.extname(name || '').toLowerCase();
  if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.csv') return 'text/csv';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.zip') return 'application/zip';
  return '';
}

function parseJson(value, fallback) {
  try {
    if (value === null || value === undefined || value === '') return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-5)}`;
}
