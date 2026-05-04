import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  BarChart3,
  Check,
  Copy,
  Clipboard,
  Code2,
  Download,
  Eye,
  FileText,
  Files,
  GripVertical,
  Link,
  ListChecks,
  Lock,
  Languages,
  Mail,
  Palette,
  Plus,
  Save,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Workflow
} from 'lucide-react';
import { api } from './api';
import type { AnswerValue, AuditEvent, AuthState, EmailEvent, FieldType, FileAnswer, Form, FormField, FormResponse, FormSettings, FormTheme, FormVersion, MaintenanceEvent, ResponsePage, WebhookEvent } from './types';
import {
  absoluteEmbedUrl,
  absolutePublicUrl,
  calculateField,
  createField,
  defaultSettings,
  defaultTheme,
  displayAnswer,
  fieldTypeLabels,
  fieldTypes,
  formatDate,
  getClientId,
  inputFieldTypes,
  isVisible,
  logicOperators,
  migrateField,
  pipeText
} from './utils';
import './styles.css';

type WorkspaceTab = 'build' | 'logic' | 'design' | 'share' | 'results' | 'settings';
type Lang = 'en' | 'zh';
type Translation = (typeof text)['en'];

const text = {
  en: {
    language: 'Language',
    workspaceSubtitle: 'Form collection workspace',
    newForm: 'New form',
    responses: 'responses',
    partials: 'partials',
    collecting: 'Collecting',
    draft: 'Draft',
    currentForm: 'Current form',
    untitledForm: 'Untitled form',
    build: 'Build',
    logic: 'Logic',
    design: 'Design',
    share: 'Share',
    results: 'Results',
    settings: 'Settings',
    save: 'Save',
    publish: 'Publish',
    unpublish: 'Unpublish',
    createFirstForm: 'Create your first form',
    ready: 'Ready',
    starterCreated: 'Starter form created',
    newFormCreated: 'New form created',
    saved: 'Saved',
    saveFailed: 'Save failed',
    formLive: 'Form is live',
    formPrivate: 'Form is private',
    formDeleted: 'Form deleted',
    linkCopied: 'Public link copied',
    deleteConfirm: 'Delete this form and its responses?',
    formDescription: 'Form description',
    addFields: 'Add fields',
    required: 'Required',
    apiKey: 'API key',
    placeholder: 'Placeholder',
    fieldDescription: 'Field description',
    options: 'Options',
    rows: 'Rows',
    columns: 'Columns',
    min: 'Min',
    max: 'Max',
    step: 'Step',
    amount: 'Amount',
    currency: 'Currency',
    preview: 'Preview',
    publicActive: 'Public link is active',
    publishToOpen: 'Publish to open access',
    openPublicPage: 'Open public page',
    alwaysVisible: 'Always visible',
    dependsOn: 'Depends on',
    value: 'Value',
    logicTitle: 'Conditional logic and piping',
    logicText: 'Show fields based on previous answers, pipe answers into text, and calculate values with formulas.',
    designTitle: 'Design',
    designText: 'Tune the public form theme, corner radius, typography, and custom CSS.',
    shareTitle: 'Share and embed',
    shareText: 'Publish a link, open the hosted form, or copy an iframe embed.',
    publicLink: 'Public link',
    embed: 'Embed',
    copy: 'Copy',
    open: 'Open',
    refresh: 'Refresh',
    responsesCsv: 'Responses CSV',
    partialsCsv: 'Partials CSV',
    completion: 'Completion',
    fields: 'Fields',
    responseTitle: 'Responses',
    partialTitle: 'Partial submissions',
    noResponses: 'No complete responses yet.',
    noPartials: 'No partial submissions saved.',
    submitted: 'Submitted',
    searchResponses: 'Search responses',
    fromDate: 'From date',
    toDate: 'To date',
    pageNext: 'Next',
    pagePrevious: 'Previous',
    downloadAttachment: 'Download',
    viewResponse: 'View',
    responseDetail: 'Response detail',
    closeDetail: 'Close',
    webhookDeliveries: 'Webhook deliveries',
    noWebhooks: 'No webhook deliveries yet.',
    webhookStatus: 'Status',
    emailDeliveries: 'Email deliveries',
    noEmailEvents: 'No email deliveries yet.',
    backupTitle: 'Backups',
    runBackup: 'Run backup',
    noBackups: 'No backups yet.',
    backupCreated: 'Backup created',
    backupFailed: 'Backup failed',
    backupSize: 'Size',
    restoreBackupAction: 'Restore',
    backupRestored: 'Backup restored',
    confirmRestoreBackup: 'Restore this backup? A safety backup will be created first.',
    testSmtp: 'Test SMTP',
    testEmailTo: 'Test email recipient',
    smtpTestSent: 'SMTP test sent',
    settingsTitle: 'Settings',
    settingsText: 'Control access, submission limits, notifications, webhooks, and data retention.',
    customSlug: 'Custom slug',
    password: 'Password',
    submissionLimit: 'Submission limit',
    closeAt: 'Close at',
    emailNotifications: 'Email notifications',
    webhookUrl: 'Webhook URL',
    webhookSecret: 'Webhook secret',
    dataRetentionDays: 'Data retention days',
    verificationQuestion: 'Verification question',
    verificationAnswer: 'Verification answer',
    preventDuplicates: 'Prevent duplicate submissions',
    savePartials: 'Save partial submissions',
    removeBranding: 'Remove Mini Tally branding',
    successMessage: 'Success message',
    redirectUrl: 'Redirect URL',
    loading: 'Loading',
    back: 'Back',
    notPublic: 'This form is not public.',
    submittedDone: 'Submitted',
    backToWorkspace: 'Back to workspace',
    workspace: 'Workspace',
    submit: 'Submit',
    poweredBy: 'Powered by Mini Tally',
    select: 'Select',
    paymentNotice: 'Payment collection requires connecting a real payment provider.',
    addOption: 'Add option',
    removeOption: 'Remove option',
    uploadFiles: 'Upload files',
    addMoreFiles: 'Add more files',
    fileHint: 'Images, PDFs, and documents. Up to 10 files.',
    removeFile: 'Remove file',
    favorite: 'Favorite',
    unfavorite: 'Unfavorite',
    starredForm: 'Added to favorites',
    unstarredForm: 'Removed from favorites',
    deleteFormAction: 'Delete form',
    duplicateForm: 'Duplicate form',
    formDuplicated: 'Form duplicated',
    versionsTitle: 'Version history',
    auditTitle: 'Activity log',
    restoreVersion: 'Restore',
    versionRestored: 'Version restored',
    noVersions: 'No versions yet.',
    noAuditEvents: 'No activity yet.',
    retryWebhook: 'Retry',
    webhookRetried: 'Webhook retried',
    adminTitle: 'Admin access',
    setupAdmin: 'Create admin password',
    loginAdmin: 'Log in',
    adminPasswordHint: 'Use at least 10 characters. Keep it somewhere safe.',
    adminPassword: 'Admin password',
    confirmPassword: 'Confirm password',
    passwordsDoNotMatch: 'Passwords do not match',
    logout: 'Log out',
    authChecking: 'Checking access',
    setupBlocked: 'Admin setup is locked on this server. Set ADMIN_PASSWORD or enable setup from SSH.'
  },
  zh: {
    language: '語言',
    workspaceSubtitle: '表單收集工作台',
    newForm: '新表單',
    responses: '份回覆',
    partials: '份部分填答',
    collecting: '收集中',
    draft: '草稿',
    currentForm: '目前表單',
    untitledForm: '未命名表單',
    build: '編輯',
    logic: '邏輯',
    design: '外觀',
    share: '分享',
    results: '結果',
    settings: '設定',
    save: '儲存',
    publish: '發布',
    unpublish: '下架',
    createFirstForm: '建立第一張表單',
    ready: '準備就緒',
    starterCreated: '已建立範例表單',
    newFormCreated: '已新增表單',
    saved: '已儲存',
    saveFailed: '儲存失敗',
    formLive: '表單已發布',
    formPrivate: '表單已設為私人',
    formDeleted: '表單已刪除',
    linkCopied: '公開連結已複製',
    deleteConfirm: '要刪除這張表單和所有回覆嗎？',
    formDescription: '表單描述',
    addFields: '新增欄位',
    required: '必填',
    apiKey: 'API 鍵',
    placeholder: '提示文字',
    fieldDescription: '欄位描述',
    options: '選項',
    rows: '列',
    columns: '欄',
    min: '最小值',
    max: '最大值',
    step: '間距',
    amount: '金額',
    currency: '幣別',
    preview: '預覽',
    publicActive: '公開連結可用',
    publishToOpen: '發布後可開放填答',
    openPublicPage: '開啟公開頁',
    alwaysVisible: '永遠顯示',
    dependsOn: '取決於',
    value: '值',
    logicTitle: '條件邏輯與答案帶入',
    logicText: '依照前面的回答顯示欄位，把答案帶入文字，並用公式計算數值。',
    designTitle: '外觀',
    designText: '調整公開表單的主題、圓角、字體與自訂 CSS。',
    shareTitle: '分享與嵌入',
    shareText: '發布連結、開啟公開表單，或複製 iframe 嵌入碼。',
    publicLink: '公開連結',
    embed: '嵌入',
    copy: '複製',
    open: '開啟',
    refresh: '重新整理',
    responsesCsv: '回覆 CSV',
    partialsCsv: '部分填答 CSV',
    completion: '完成率',
    fields: '欄位',
    responseTitle: '回覆',
    partialTitle: '部分填答',
    noResponses: '還沒有完整回覆。',
    noPartials: '還沒有儲存的部分填答。',
    submitted: '提交時間',
    searchResponses: '搜尋回覆',
    fromDate: '開始日期',
    toDate: '結束日期',
    pageNext: '下一頁',
    pagePrevious: '上一頁',
    downloadAttachment: '下載',
    viewResponse: '查看',
    responseDetail: '回覆詳情',
    closeDetail: '關閉',
    webhookDeliveries: 'Webhook 傳送紀錄',
    noWebhooks: '還沒有 webhook 傳送紀錄。',
    webhookStatus: '狀態',
    emailDeliveries: 'Email 傳送紀錄',
    noEmailEvents: '還沒有 Email 傳送紀錄。',
    backupTitle: '備份',
    runBackup: '立即備份',
    noBackups: '還沒有備份。',
    backupCreated: '已建立備份',
    backupFailed: '備份失敗',
    backupSize: '大小',
    restoreBackupAction: '還原',
    backupRestored: '已還原備份',
    confirmRestoreBackup: '要還原這份備份嗎？系統會先建立安全備份。',
    testSmtp: '測試 SMTP',
    testEmailTo: '測試收件人',
    smtpTestSent: 'SMTP 測試已送出',
    settingsTitle: '設定',
    settingsText: '控制存取、提交限制、通知、webhook 與資料保留。',
    customSlug: '自訂網址代稱',
    password: '密碼',
    submissionLimit: '提交上限',
    closeAt: '關閉時間',
    emailNotifications: 'Email 通知',
    webhookUrl: 'Webhook URL',
    webhookSecret: 'Webhook 密鑰',
    dataRetentionDays: '資料保留天數',
    verificationQuestion: '驗證問題',
    verificationAnswer: '驗證答案',
    preventDuplicates: '防止重複提交',
    savePartials: '儲存部分填答',
    removeBranding: '移除 Mini Tally 品牌',
    successMessage: '成功訊息',
    redirectUrl: '重新導向 URL',
    loading: '載入中',
    back: '返回',
    notPublic: '這張表單尚未公開。',
    submittedDone: '已送出',
    backToWorkspace: '回到工作台',
    workspace: '工作台',
    submit: '送出',
    poweredBy: '由 Mini Tally 提供',
    select: '請選擇',
    paymentNotice: '收款功能需要串接真實金流服務。',
    addOption: '新增選項',
    removeOption: '刪除選項',
    uploadFiles: '上傳附件',
    addMoreFiles: '增加附件',
    fileHint: '可上傳圖片、PDF 和文件，最多 10 個檔案。',
    removeFile: '移除檔案',
    favorite: '收藏',
    unfavorite: '取消收藏',
    starredForm: '已加入收藏',
    unstarredForm: '已取消收藏',
    deleteFormAction: '刪除表單',
    duplicateForm: '複製表單',
    formDuplicated: '已複製表單',
    versionsTitle: '版本歷史',
    auditTitle: '操作紀錄',
    restoreVersion: '還原',
    versionRestored: '已還原版本',
    noVersions: '還沒有版本紀錄。',
    noAuditEvents: '還沒有操作紀錄。',
    retryWebhook: '重試',
    webhookRetried: 'Webhook 已重試',
    adminTitle: '管理員登入',
    setupAdmin: '建立管理員密碼',
    loginAdmin: '登入',
    adminPasswordHint: '最少 10 個字元，請自己保存好。',
    adminPassword: '管理員密碼',
    confirmPassword: '確認密碼',
    passwordsDoNotMatch: '兩次密碼不一致',
    logout: '登出',
    authChecking: '正在檢查權限',
    setupBlocked: '這個伺服器已鎖定首次設定，請用 SSH 設定 ADMIN_PASSWORD 或開啟 setup。'
  }
} as const;

const fieldTypeLabelsZh: Record<FieldType, string> = {
  short_text: '短文字',
  long_text: '長文字',
  email: 'Email',
  number: '數字',
  phone: '電話',
  url: 'URL',
  date: '日期',
  time: '時間',
  dropdown: '下拉選單',
  multiple_choice: '單選',
  checkboxes: '多選',
  multi_select: '多選選單',
  file_upload: '檔案上傳',
  signature: '簽名上傳',
  rating: '評分',
  linear_scale: '線性量表',
  ranking: '排序',
  matrix: '矩陣',
  hidden: '隱藏欄位',
  calculated: '計算欄位',
  payment: '付款區塊',
  statement: '文字區塊',
  page_break: '分頁線'
};

const LanguageContext = React.createContext<{
  lang: Lang;
  t: Translation;
  toggleLanguage: () => void;
} | null>(null);

function useI18n() {
  const context = React.useContext(LanguageContext);
  if (!context) throw new Error('Language context is missing');
  return context;
}

function fieldTypeLabel(type: FieldType, lang: Lang) {
  return lang === 'zh' ? fieldTypeLabelsZh[type] : fieldTypeLabels[type];
}

function langLabel(label: string, lang: Lang) {
  if (lang !== 'zh') return label;
  const map: Record<string, string> = {
    equals: '等於',
    'does not equal': '不等於',
    contains: '包含',
    'is empty': '是空的',
    'is not empty': '不是空的',
    'is greater than': '大於',
    'is less than': '小於'
  };
  return map[label] || label;
}

function LanguageButton({ className = '' }: { className?: string }) {
  const { lang, t, toggleLanguage } = useI18n();
  return (
    <button type="button" className={`language-toggle ${className}`} onClick={toggleLanguage} title={t.language}>
      <Languages size={16} />
      {lang === 'en' ? '中文' : 'EN'}
    </button>
  );
}

function AdminGate({ onReady }: { onReady: () => void }) {
  const { t } = useI18n();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const needsSetup = auth ? !auth.configured : false;
  const setupBlocked = needsSetup && auth?.setupAllowed === false;

  useEffect(() => {
    api
      .authState()
      .then((state) => {
        setAuth(state);
        if (state.authenticated) onReady();
      })
      .catch(() => setMessage(t.saveFailed));
  }, [onReady, t.saveFailed]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    if (setupBlocked) {
      setMessage(t.setupBlocked);
      return;
    }
    if (needsSetup && password !== confirmPassword) {
      setMessage(t.passwordsDoNotMatch);
      return;
    }
    try {
      if (needsSetup) await api.setupAdmin(password);
      else await api.login(password);
      onReady();
    } catch (error) {
      setMessage(error && typeof error === 'object' && 'message' in error ? String(error.message) : t.saveFailed);
    }
  }

  if (!auth) {
    return (
      <main className="auth-page">
        <div className="auth-panel">
          <div className="auth-header">
            <div className="brand-mark">
              <Lock size={18} />
            </div>
            <LanguageButton className="auth-language" />
          </div>
          <p>{t.authChecking}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <div className="auth-header">
          <div className="brand-mark">
            <Lock size={18} />
          </div>
          <LanguageButton className="auth-language" />
        </div>
        <div>
          <p className="eyebrow">{t.adminTitle}</p>
          <h1>{needsSetup ? t.setupAdmin : t.loginAdmin}</h1>
        </div>
        <label className="stack-label">
          {t.adminPassword}
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={needsSetup ? 10 : undefined} autoFocus />
        </label>
        {needsSetup && (
          <label className="stack-label">
            {t.confirmPassword}
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={10} />
          </label>
        )}
        {needsSetup && <small>{setupBlocked ? t.setupBlocked : t.adminPasswordHint}</small>}
        {message && <div className="form-error compact">{message}</div>}
        <button className="submit-button" type="submit" disabled={setupBlocked}>
          <Lock size={17} />
          {needsSetup ? t.setupAdmin : t.loginAdmin}
        </button>
      </form>
    </main>
  );
}

const starterForm: Partial<Form> = {
  title: 'Client intake',
  description: 'Tell us about your project and we will get back to you.',
  published: true,
  settings: { ...defaultSettings, partialSubmissions: true },
  theme: defaultTheme,
  fields: [
    { ...createField('short_text'), label: 'Name', required: true, placeholder: 'Ada Lovelace' },
    { ...createField('email'), label: 'Email', required: true, placeholder: 'name@example.com' },
    { ...createField('multiple_choice'), label: 'Budget range', options: ['Under $1k', '$1k - $5k', '$5k+'] },
    { ...createField('long_text'), label: 'What do you need?', placeholder: 'Share the short version' }
  ]
};

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (nextPath: string) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
  };

  return { path, navigate };
}

function App() {
  const { path, navigate } = useRoute();
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('mini_tally_lang') === 'zh' ? 'zh' : 'en'));
  const [adminReady, setAdminReady] = useState(false);
  const markAdminReady = useCallback(() => setAdminReady(true), []);
  const publicMatch = path.match(/^\/form\/([^/]+)$/);
  const embedMatch = path.match(/^\/embed\/([^/]+)$/);

  useEffect(() => {
    localStorage.setItem('mini_tally_lang', lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      t: text[lang] as Translation,
      toggleLanguage: () => setLang((current) => (current === 'en' ? 'zh' : 'en'))
    }),
    [lang]
  );

  return (
    <LanguageContext.Provider value={value}>
      {publicMatch || embedMatch ? (
        <PublicForm formKey={(publicMatch || embedMatch)![1]} navigate={navigate} embedded={Boolean(embedMatch)} />
      ) : !adminReady ? (
        <AdminGate onReady={markAdminReady} />
      ) : (
        <Workspace navigate={navigate} onLogout={() => setAdminReady(false)} />
      )}
    </LanguageContext.Provider>
  );
}

function Workspace({ navigate, onLogout }: { navigate: (path: string) => void; onLogout: () => void }) {
  const { lang, t } = useI18n();
  const [forms, setForms] = useState<Form[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<Form | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [partials, setPartials] = useState<FormResponse[]>([]);
  const [responsePage, setResponsePage] = useState<ResponsePage | null>(null);
  const [partialPage, setPartialPage] = useState<ResponsePage | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('build');
  const [status, setStatus] = useState<string>(t.ready);
  const [saving, setSaving] = useState(false);

  const selectedForm = useMemo(() => forms.find((form) => form.id === selectedId), [forms, selectedId]);
  const sortedForms = useMemo(
    () =>
      [...forms].sort((a, b) => {
        const starredDiff = Number(Boolean(b.starred)) - Number(Boolean(a.starred));
        if (starredDiff !== 0) return starredDiff;
        return b.updatedAt.localeCompare(a.updatedAt);
      }),
    [forms]
  );

  useEffect(() => {
    void loadForms();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadResponses(selectedId);
  }, [selectedId]);

  async function loadForms(preferredId?: string) {
    const nextForms = await api.listForms();
    if (nextForms.length === 0) {
      const created = await api.createForm(starterForm);
      setForms([created]);
      setSelectedId(created.id);
      setDraft(created);
      setStatus(t.starterCreated);
      return;
    }

    setForms(nextForms);
    const nextSelected = preferredId || selectedId || nextForms[0].id;
    setSelectedId(nextSelected);
    setDraft(nextForms.find((form) => form.id === nextSelected) || nextForms[0]);
  }

  async function loadResponses(formId: string) {
    const [nextResponses, nextPartials] = await Promise.all([
      api.listResponsePage(formId, { status: 'complete', page: 1, pageSize: 50 }),
      api.listResponsePage(formId, { status: 'partial', page: 1, pageSize: 50 })
    ]);
    setResponsePage(nextResponses);
    setPartialPage(nextPartials);
    setResponses(nextResponses.items);
    setPartials(nextPartials.items);
  }

  async function createNewForm() {
    const created = await api.createForm({
      title: t.untitledForm,
      description: '',
      published: false,
      settings: defaultSettings,
      theme: defaultTheme,
      fields: [createField('short_text')]
    });
    await loadForms(created.id);
    setTab('build');
    setStatus(t.newFormCreated);
  }

  function selectForm(form: Form) {
    setSelectedId(form.id);
    setDraft(form);
    setTab('build');
  }

  function updateDraft(updater: (current: Form) => Form) {
    setDraft((current) => (current ? updater(current) : current));
  }

  async function saveDraft(nextDraft = draft) {
    if (!nextDraft) return;
    setSaving(true);
    try {
      const saved = await api.updateForm(nextDraft.id, nextDraft);
      setDraft(saved);
      setForms((current) =>
        current.map((form) =>
          form.id === saved.id ? { ...saved, responseCount: form.responseCount, partialCount: form.partialCount } : form
        )
      );
      setStatus(`${t.saved} ${formatDate(saved.updatedAt)}`);
    } catch (error) {
      setStatus(error && typeof error === 'object' && 'message' in error ? String(error.message) : t.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    if (!draft) return;
    const nextDraft = { ...draft, published: !draft.published };
    setDraft(nextDraft);
    await saveDraft(nextDraft);
    setStatus(nextDraft.published ? t.formLive : t.formPrivate);
  }

  async function deleteCurrentForm() {
    if (!draft) return;
    await deleteForm(draft);
  }

  async function deleteForm(form: Form) {
    if (!window.confirm(`${t.deleteConfirm}\n\n${form.title}`)) return;
    await api.deleteForm(form.id);
    if (draft?.id === form.id) {
      setDraft(null);
      setSelectedId('');
    }
    setStatus(t.formDeleted);
    await loadForms();
  }

  async function duplicateForm(form: Form) {
    const cloned = await api.cloneForm(form.id);
    await loadForms(cloned.id);
    setTab('build');
    setStatus(t.formDuplicated);
  }

  async function toggleFavorite(form: Form) {
    const nextForm = { ...form, starred: !form.starred };
    const saved = await api.updateForm(form.id, nextForm);
    setForms((current) =>
      current.map((item) =>
        item.id === saved.id ? { ...saved, responseCount: item.responseCount, partialCount: item.partialCount } : item
      )
    );
    if (draft?.id === saved.id) setDraft(saved);
    if (saved.starred) {
      setStatus(lang === 'zh' ? '已加入收藏' : 'Added to favorites');
    } else {
      setStatus(lang === 'zh' ? '已取消收藏' : 'Removed from favorites');
    }
  }

  async function copyPublicLink() {
    if (!draft) return;
    await navigator.clipboard.writeText(absolutePublicUrl(draft.settings.customSlug || draft.id));
    setStatus(t.linkCopied);
  }

  async function logout() {
    await api.logout().catch(() => undefined);
    onLogout();
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ListChecks size={19} />
          </div>
          <div>
            <p>Mini Tally</p>
            <span>{t.workspaceSubtitle}</span>
          </div>
        </div>

        <LanguageButton />

        <button className="text-button" onClick={() => void logout()}>
          <Lock size={16} />
          {t.logout}
        </button>

        <button className="primary-action" onClick={createNewForm}>
          <Plus size={17} />
          {t.newForm}
        </button>

        <div className="form-list" aria-label="Forms">
          {sortedForms.map((form) => (
            <div className="form-list-row" key={form.id}>
              <button className={`form-list-item ${form.id === selectedId ? 'active' : ''}`} onClick={() => selectForm(form)}>
                <FileText size={17} />
                <span>
                  <strong>{form.title}</strong>
                  <small>
                    {form.responseCount || 0} {t.responses}, {form.partialCount || 0} {t.partials}
                  </small>
                </span>
              </button>
              <div className="form-list-actions">
                <button
                  type="button"
                  className={`list-action-btn ${form.starred ? 'active' : ''}`}
                  title={form.starred ? (lang === 'zh' ? '取消收藏' : 'Unfavorite') : lang === 'zh' ? '收藏' : 'Favorite'}
                  aria-label={form.starred ? (lang === 'zh' ? '取消收藏' : 'Unfavorite') : lang === 'zh' ? '收藏' : 'Favorite'}
                  onClick={() => void toggleFavorite(form)}
                >
                  <Star size={15} />
                </button>
                <button
                  type="button"
                  className="list-action-btn"
                  title={t.duplicateForm}
                  aria-label={t.duplicateForm}
                  onClick={() => void duplicateForm(form)}
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  className="list-action-btn danger"
                  title={lang === 'zh' ? '刪除表單' : 'Delete form'}
                  aria-label={lang === 'zh' ? '刪除表單' : 'Delete form'}
                  onClick={() => void deleteForm(form)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          <span className={draft?.published ? 'dot live' : 'dot'} />
          {draft?.published ? t.collecting : t.draft}
        </div>
      </aside>

      {draft ? (
        <section className="workspace">
          <header className="topbar">
            <div>
              <p className="eyebrow">{t.currentForm}</p>
              <h1>{draft.title || t.untitledForm}</h1>
            </div>
            <div className="toolbar">
              <TabButton tab="build" active={tab} setTab={setTab} icon={<Settings2 size={16} />} label={t.build} />
              <TabButton tab="logic" active={tab} setTab={setTab} icon={<Workflow size={16} />} label={t.logic} />
              <TabButton tab="design" active={tab} setTab={setTab} icon={<Palette size={16} />} label={t.design} />
              <TabButton tab="share" active={tab} setTab={setTab} icon={<Link size={16} />} label={t.share} />
              <TabButton tab="results" active={tab} setTab={setTab} icon={<BarChart3 size={16} />} label={t.results} />
              <TabButton tab="settings" active={tab} setTab={setTab} icon={<SlidersHorizontal size={16} />} label={t.settings} />
              <button className="icon-button" title={t.save} onClick={() => saveDraft()} disabled={saving}>
                <Save size={17} />
              </button>
              <button className="text-button" onClick={togglePublish}>
                <Send size={17} />
                {draft.published ? t.unpublish : t.publish}
              </button>
            </div>
          </header>

          {tab === 'build' && (
            <div className="builder-layout">
              <FormEditor draft={draft} updateDraft={updateDraft} saveDraft={saveDraft} deleteCurrentForm={deleteCurrentForm} />
              <PreviewPane form={draft} navigate={navigate} />
            </div>
          )}
          {tab === 'logic' && <LogicPanel form={draft} updateDraft={updateDraft} saveDraft={saveDraft} />}
          {tab === 'design' && <DesignPanel form={draft} updateDraft={updateDraft} saveDraft={saveDraft} />}
          {tab === 'share' && <SharePanel form={draft} copyPublicLink={copyPublicLink} navigate={navigate} />}
          {tab === 'results' && (
            <ResultsPanel
              form={draft}
              responses={responses}
              partials={partials}
              responsePage={responsePage}
              partialPage={partialPage}
              reloadResponses={() => loadResponses(draft.id)}
              onResponsesChange={(page) => {
                setResponsePage(page);
                setResponses(page.items);
              }}
              onPartialsChange={(page) => {
                setPartialPage(page);
                setPartials(page.items);
              }}
              reload={() => loadResponses(draft.id)}
            />
          )}
          {tab === 'settings' && (
            <SettingsPanel
              form={draft}
              updateDraft={updateDraft}
              saveDraft={saveDraft}
              onRestore={(restored) => {
                setDraft(restored);
                setForms((current) => current.map((item) => (item.id === restored.id ? { ...restored, responseCount: item.responseCount, partialCount: item.partialCount } : item)));
                setStatus(t.versionRestored);
              }}
            />
          )}

          <div className="status-bar">
            <span>{status}</span>
            {selectedForm && <span>Updated {formatDate(selectedForm.updatedAt)}</span>}
          </div>
        </section>
      ) : (
        <section className="empty-state">
          <h1>{t.createFirstForm}</h1>
          <button className="primary-action" onClick={createNewForm}>
            <Plus size={17} />
            {t.newForm}
          </button>
        </section>
      )}
    </main>
  );
}

function TabButton({
  tab,
  active,
  setTab,
  icon,
  label
}: {
  tab: WorkspaceTab;
  active: WorkspaceTab;
  setTab: (tab: WorkspaceTab) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button className={`nav-tab ${active === tab ? 'selected' : ''}`} onClick={() => setTab(tab)}>
      {icon}
      {label}
    </button>
  );
}

function FormEditor({
  draft,
  updateDraft,
  saveDraft,
  deleteCurrentForm
}: {
  draft: Form;
  updateDraft: (updater: (current: Form) => Form) => void;
  saveDraft: (nextDraft?: Form | null) => void;
  deleteCurrentForm: () => void;
}) {
  const { lang, t } = useI18n();
  function updateField(fieldId: string, patch: Partial<FormField>) {
    updateDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field))
    }));
  }

  function addField(type: FieldType) {
    updateDraft((current) => ({ ...current, fields: [...current.fields, createField(type)] }));
  }

  function removeField(fieldId: string) {
    updateDraft((current) => ({ ...current, fields: current.fields.filter((field) => field.id !== fieldId) }));
  }

  function moveField(fieldId: string, direction: -1 | 1) {
    updateDraft((current) => {
      const index = current.fields.findIndex((field) => field.id === fieldId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.fields.length) return current;
      const nextFields = [...current.fields];
      const [item] = nextFields.splice(index, 1);
      nextFields.splice(nextIndex, 0, item);
      return { ...current, fields: nextFields };
    });
  }

  return (
    <section className="editor-pane">
      <div className="editor-title-row">
        <input
          className="title-input"
          value={draft.title}
          onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))}
          onBlur={() => saveDraft()}
          aria-label="Form title"
        />
        <button className="danger-icon" title={t.formDeleted} onClick={deleteCurrentForm}>
          <Trash2 size={17} />
        </button>
      </div>

      <textarea
        className="description-input"
        value={draft.description}
        onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))}
        onBlur={() => saveDraft()}
        placeholder={t.formDescription}
        rows={3}
      />

      <div className="field-picker" aria-label={t.addFields}>
        {fieldTypes.map((type) => (
          <button key={type} onClick={() => addField(type)}>
            <Plus size={14} />
            {fieldTypeLabel(type, lang)}
          </button>
        ))}
      </div>

      <div className="field-stack">
        {draft.fields.map((field, index) => (
          <article className="field-editor" key={field.id}>
            <div className="field-editor-top">
              <GripVertical size={17} className="muted-icon" />
              <input
                value={field.label}
                onChange={(event) => updateField(field.id, { label: event.target.value })}
                onBlur={() => saveDraft()}
                aria-label="Field label"
              />
              <select
                value={field.type}
                onChange={(event) => {
                  const nextField = migrateField({ ...field, type: event.target.value as FieldType });
                  updateField(field.id, nextField.type === field.type ? {} : nextField);
                }}
                onBlur={() => saveDraft()}
                aria-label="Field type"
              >
                {fieldTypes.map((type) => (
                  <option key={type} value={type}>
                    {fieldTypeLabel(type, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-options-row">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => updateField(field.id, { required: event.target.checked })}
                  onBlur={() => saveDraft()}
                />
                <span>{t.required}</span>
              </label>
              <input
                className="placeholder-input"
                value={field.placeholder}
                onChange={(event) => updateField(field.id, { placeholder: event.target.value })}
                onBlur={() => saveDraft()}
                placeholder={t.placeholder}
              />
              <div className="field-actions">
                <button title="Move up" onClick={() => moveField(field.id, -1)} disabled={index === 0}>
                  ↑
                </button>
                <button title="Move down" onClick={() => moveField(field.id, 1)} disabled={index === draft.fields.length - 1}>
                  ↓
                </button>
                <button title="Delete field" onClick={() => removeField(field.id)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <textarea
              className="description-input compact"
              value={field.description}
              onChange={(event) => updateField(field.id, { description: event.target.value })}
              onBlur={() => saveDraft()}
              placeholder={t.fieldDescription}
              rows={2}
            />

            <details className="field-advanced">
              <summary>{t.apiKey}</summary>
              <input
                value={field.key}
                onChange={(event) => updateField(field.id, { key: event.target.value })}
                onBlur={() => saveDraft()}
                placeholder={t.apiKey}
              />
            </details>

            {['dropdown', 'multiple_choice', 'checkboxes', 'multi_select', 'ranking'].includes(field.type) && (
              <OptionEditor
                label={t.options}
                values={field.options}
                onCommit={(options) =>
                  saveDraft({
                    ...draft,
                    fields: draft.fields.map((item) => (item.id === field.id ? { ...item, options } : item))
                  })
                }
              />
            )}

            {field.type === 'matrix' && (
              <div className="split-grid">
                <OptionEditor
                  label={t.rows}
                  values={field.rows}
                  onCommit={(rows) =>
                    saveDraft({
                      ...draft,
                      fields: draft.fields.map((item) => (item.id === field.id ? { ...item, rows } : item))
                    })
                  }
                />
                <OptionEditor
                  label={t.columns}
                  values={field.columns}
                  onCommit={(columns) =>
                    saveDraft({
                      ...draft,
                      fields: draft.fields.map((item) => (item.id === field.id ? { ...item, columns } : item))
                    })
                  }
                />
              </div>
            )}

            {['rating', 'linear_scale'].includes(field.type) && (
              <div className="split-grid triple">
                <NumberInput label={t.min} value={field.min} onChange={(min) => updateField(field.id, { min })} saveDraft={saveDraft} />
                <NumberInput label={t.max} value={field.max} onChange={(max) => updateField(field.id, { max })} saveDraft={saveDraft} />
                <NumberInput label={t.step} value={field.step} onChange={(step) => updateField(field.id, { step })} saveDraft={saveDraft} />
              </div>
            )}

            {field.type === 'calculated' && (
              <input
                value={field.formula}
                onChange={(event) => updateField(field.id, { formula: event.target.value })}
                onBlur={() => saveDraft()}
                placeholder="Formula, e.g. {{q_price}} * 2"
              />
            )}

            {field.type === 'payment' && (
              <div className="split-grid">
                <NumberInput label={t.amount} value={field.price} onChange={(price) => updateField(field.id, { price })} saveDraft={saveDraft} />
                <label className="stack-label">
                  {t.currency}
                  <input value={field.currency} onChange={(event) => updateField(field.id, { currency: event.target.value })} onBlur={() => saveDraft()} />
                </label>
              </div>
            )}

            {['file_upload', 'signature'].includes(field.type) && (
              <div className="field-upload-preview" aria-hidden="true">
                <span className="attachment-icon">
                  <Upload size={18} />
                </span>
                <div>
                  <strong>{t.uploadFiles}</strong>
                  <small>{lang === 'zh' ? '這裡是編輯時的區塊預覽，右側預覽卡可以實際測試上傳。' : 'This is the editor block preview. Use the preview card on the right to test uploads.'}</small>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function OptionEditor({
  label,
  values,
  onCommit
}: {
  label: string;
  values: string[];
  onCommit: (values: string[]) => void;
}) {
  const { lang, t } = useI18n();
  const [draftValues, setDraftValues] = useState(values.length ? values : ['']);

  useEffect(() => {
    setDraftValues(values.length ? values : ['']);
  }, [values]);

  function normalizeOptions(items: string[]) {
    return items
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function commitOptions(items = draftValues) {
    const nextValues = normalizeOptions(items);
    setDraftValues(nextValues.length ? nextValues : ['']);
    onCommit(nextValues);
  }

  return (
    <div className="stack-label option-list-editor">
      <span>{label}</span>
      <div className="option-input-stack">
        {draftValues.map((value, index) => (
          <div className="option-input-row" key={`${index}-${draftValues.length}`}>
            <input
              value={value}
              onChange={(event) => {
                const nextValues = draftValues.map((item, itemIndex) => (itemIndex === index ? event.target.value : item));
                setDraftValues(nextValues);
              }}
              onBlur={() => commitOptions()}
              placeholder={`${label} ${index + 1}`}
            />
            <button
              type="button"
              className="icon-button"
              title={t.removeOption}
              onClick={() => {
                const nextValues = draftValues.filter((_item, itemIndex) => itemIndex !== index);
                setDraftValues(nextValues.length ? nextValues : ['']);
                onCommit(normalizeOptions(nextValues));
              }}
              disabled={draftValues.length === 1 && !draftValues[0]}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="text-button option-add-button"
        onClick={() => {
          const nextValues = [...draftValues, ''];
          setDraftValues(nextValues);
        }}
      >
        <Plus size={15} />
        {t.addOption}
      </button>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  saveDraft
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  saveDraft: (nextDraft?: Form | null) => void;
}) {
  return (
    <label className="stack-label">
      {label}
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} onBlur={() => saveDraft()} />
    </label>
  );
}

function PreviewPane({ form, navigate }: { form: Form; navigate: (path: string) => void }) {
  const { t } = useI18n();
  const key = form.settings.customSlug || form.id;
  const [previewValues, setPreviewValues] = useState<Record<string, AnswerValue>>({});

  useEffect(() => {
    setPreviewValues({});
  }, [form.id]);

  return (
    <aside className="preview-pane">
      <div className="preview-header">
        <div>
          <p className="eyebrow">{t.preview}</p>
          <strong>{form.published ? t.publicActive : t.publishToOpen}</strong>
        </div>
        <button className="icon-button" title={t.openPublicPage} onClick={() => navigate(`/form/${key}`)} disabled={!form.published}>
          <Eye size={17} />
        </button>
      </div>
      <div className="public-card">
        <FormRenderer
          form={form}
          values={previewValues}
          errors={{}}
          onChange={(fieldId, value) =>
            setPreviewValues((current) => ({
              ...current,
              [fieldId]: value
            }))
          }
        />
      </div>
    </aside>
  );
}

function LogicPanel({
  form,
  updateDraft,
  saveDraft
}: {
  form: Form;
  updateDraft: (updater: (current: Form) => Form) => void;
  saveDraft: (nextDraft?: Form | null) => void;
}) {
  const { lang, t } = useI18n();
  function updateField(fieldId: string, patch: Partial<FormField>) {
    updateDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field))
    }));
  }

  return (
    <section className="panel-page">
      <PanelIntro icon={<Workflow size={20} />} title={t.logicTitle} text={t.logicText} />
      <div className="field-stack">
        {form.fields.map((field) => (
          <article className="field-editor" key={field.id}>
            <div className="field-editor-top logic-row">
              <strong>{field.label}</strong>
              <select
                value={field.visibility?.fieldId || ''}
                onChange={(event) =>
                  updateField(field.id, {
                    visibility: event.target.value ? { fieldId: event.target.value, operator: 'equals', value: '' } : undefined
                  })
                }
                onBlur={() => saveDraft()}
              >
                <option value="">{t.alwaysVisible}</option>
                {form.fields
                  .filter((item) => item.id !== field.id && inputFieldTypes.includes(item.type))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {t.dependsOn} {item.label}
                    </option>
                  ))}
              </select>
              {field.visibility && (
                <>
                  <select
                    value={field.visibility.operator}
                    onChange={(event) => updateField(field.id, { visibility: { ...field.visibility!, operator: event.target.value as never } })}
                    onBlur={() => saveDraft()}
                  >
                    {Object.entries(logicOperators).map(([key, label]) => (
                    <option key={key} value={key}>
                    {langLabel(label, lang)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={field.visibility.value}
                    onChange={(event) => updateField(field.id, { visibility: { ...field.visibility!, value: event.target.value } })}
                    onBlur={() => saveDraft()}
                    placeholder={t.value}
                  />
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DesignPanel({
  form,
  updateDraft,
  saveDraft
}: {
  form: Form;
  updateDraft: (updater: (current: Form) => Form) => void;
  saveDraft: (nextDraft?: Form | null) => void;
}) {
  const { t } = useI18n();
  function updateTheme(patch: Partial<FormTheme>) {
    updateDraft((current) => ({ ...current, theme: { ...current.theme, ...patch } }));
  }

  return (
    <section className="panel-page">
      <PanelIntro icon={<Palette size={20} />} title={t.designTitle} text={t.designText} />
      <div className="settings-grid">
        <ColorInput label="Accent" value={form.theme.accent} onChange={(accent) => updateTheme({ accent })} saveDraft={saveDraft} />
        <ColorInput label="Background" value={form.theme.background} onChange={(background) => updateTheme({ background })} saveDraft={saveDraft} />
        <ColorInput label="Surface" value={form.theme.surface} onChange={(surface) => updateTheme({ surface })} saveDraft={saveDraft} />
        <ColorInput label="Text" value={form.theme.text} onChange={(text) => updateTheme({ text })} saveDraft={saveDraft} />
        <NumberInput label="Radius" value={form.theme.radius} onChange={(radius) => updateTheme({ radius })} saveDraft={saveDraft} />
        <label className="stack-label">
          Font family
          <input value={form.theme.font} onChange={(event) => updateTheme({ font: event.target.value })} onBlur={() => saveDraft()} />
        </label>
      </div>
      <label className="stack-label wide">
        Custom CSS
        <textarea value={form.theme.customCss} onChange={(event) => updateTheme({ customCss: event.target.value })} onBlur={() => saveDraft()} rows={8} />
      </label>
      <div className="public-card theme-sample">
        <FormRenderer form={form} values={{}} errors={{}} onChange={() => undefined} disabled />
      </div>
    </section>
  );
}

function ColorInput({ label, value, onChange, saveDraft }: { label: string; value: string; onChange: (value: string) => void; saveDraft: () => void }) {
  return (
    <label className="stack-label">
      {label}
      <span className="color-row">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => saveDraft()} />
        <input value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => saveDraft()} />
      </span>
    </label>
  );
}

function SharePanel({ form, copyPublicLink, navigate }: { form: Form; copyPublicLink: () => void; navigate: (path: string) => void }) {
  const { t } = useI18n();
  const key = form.settings.customSlug || form.id;
  const publicUrl = absolutePublicUrl(key);
  const embedUrl = absoluteEmbedUrl(key);
  const embedCode = `<iframe src="${embedUrl}" width="100%" height="760" frameborder="0"></iframe>`;

  return (
    <section className="panel-page">
      <PanelIntro icon={<Link size={20} />} title={t.shareTitle} text={t.shareText} />
      <div className="share-grid">
        <article className="share-block">
          <p className="eyebrow">{t.publicLink}</p>
          <code>{publicUrl}</code>
          <div className="toolbar left">
            <button className="text-button" onClick={copyPublicLink}>
              <Clipboard size={17} />
              {t.copy}
            </button>
            <button className="text-button" onClick={() => navigate(`/form/${key}`)} disabled={!form.published}>
              <Eye size={17} />
              {t.open}
            </button>
          </div>
        </article>
        <article className="share-block">
          <p className="eyebrow">{t.embed}</p>
          <textarea value={embedCode} readOnly rows={5} />
        </article>
      </div>
    </section>
  );
}

function ResultsPanel({
  form,
  responses,
  partials,
  responsePage,
  partialPage,
  reloadResponses,
  onResponsesChange,
  onPartialsChange,
  reload
}: {
  form: Form;
  responses: FormResponse[];
  partials: FormResponse[];
  responsePage: ResponsePage | null;
  partialPage: ResponsePage | null;
  reloadResponses: () => Promise<void>;
  onResponsesChange: (page: ResponsePage) => void;
  onPartialsChange: (page: ResponsePage) => void;
  reload: () => void;
}) {
  const { t } = useI18n();
  const [filters, setFilters] = useState({ search: '', from: '', to: '' });
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [emails, setEmails] = useState<EmailEvent[]>([]);
  const [selectedResponse, setSelectedResponse] = useState<FormResponse | null>(null);
  const responseTotal = responsePage?.total ?? responses.length;
  const partialTotal = partialPage?.total ?? partials.length;
  const completionRate = responseTotal + partialTotal === 0 ? 0 : Math.round((responseTotal / (responseTotal + partialTotal)) * 100);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listWebhooks(form.id), api.listEmailEvents(form.id)])
      .then(([nextWebhooks, nextEmails]) => {
        if (cancelled) return;
        setWebhooks(nextWebhooks);
        setEmails(nextEmails);
      })
      .catch(() => {
        if (cancelled) return;
        setWebhooks([]);
        setEmails([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.id, responses.length]);

  async function loadPage(status: 'complete' | 'partial', page = 1) {
    const nextPage = await api.listResponsePage(form.id, { status, ...filters, page, pageSize: 50 });
    if (status === 'complete') onResponsesChange(nextPage);
    else onPartialsChange(nextPage);
  }

  async function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    await Promise.all([loadPage('complete', 1), loadPage('partial', 1)]);
  }

  async function openResponse(responseId: string) {
    const response = await api.getResponse(form.id, responseId);
    setSelectedResponse(response);
  }

  return (
    <section className="responses-pane">
      <div className="responses-head">
        <div>
          <p className="eyebrow">{t.results}</p>
          <h2>{responses.length} {t.responses}</h2>
        </div>
        <div className="toolbar">
          <button className="text-button" onClick={reload}>
            <Clipboard size={17} />
            {t.refresh}
          </button>
          <a className="text-button" href={`/api/forms/${form.id}/responses.csv`}>
            <Download size={17} />
            {t.responsesCsv}
          </a>
          <a className="text-button" href={`/api/forms/${form.id}/partials.csv`}>
            <Download size={17} />
            {t.partialsCsv}
          </a>
        </div>
      </div>

      <div className="metrics-row">
        <Metric label={t.completion} value={`${completionRate}%`} />
        <Metric label={t.partials} value={String(partialTotal)} />
        <Metric label={t.fields} value={String(form.fields.length)} />
      </div>

      <form className="results-filters" onSubmit={(event) => void applyFilters(event)}>
        <label className="stack-label">
          {t.searchResponses}
          <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </label>
        <label className="stack-label">
          {t.fromDate}
          <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
        </label>
        <label className="stack-label">
          {t.toDate}
          <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
        </label>
        <button className="text-button" type="submit">
          <Clipboard size={17} />
          {t.refresh}
        </button>
      </form>

      <ResponseTable title={t.responseTitle} form={form} responses={responses} page={responsePage} empty={t.noResponses} onPage={(page) => void loadPage('complete', page)} onOpen={openResponse} />
      <ResponseTable title={t.partialTitle} form={form} responses={partials} page={partialPage} empty={t.noPartials} onPage={(page) => void loadPage('partial', page)} onOpen={openResponse} />
      {selectedResponse && <ResponseDetail form={form} response={selectedResponse} close={() => setSelectedResponse(null)} />}
      <WebhookLog
        events={webhooks}
        retry={async (eventId) => {
          await api.retryWebhook(form.id, eventId);
          const events = await api.listWebhooks(form.id);
          setWebhooks(events);
          await reloadResponses();
        }}
      />
      <EmailLog events={emails} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ResponseTable({
  title,
  form,
  responses,
  page,
  empty,
  onPage,
  onOpen
}: {
  title: string;
  form: Form;
  responses: FormResponse[];
  page: ResponsePage | null;
  empty: string;
  onPage: (page: number) => void;
  onOpen: (responseId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [opening, setOpening] = useState('');

  async function open(responseId: string) {
    setOpening(responseId);
    try {
      await onOpen(responseId);
    } finally {
      setOpening('');
    }
  }

  return (
    <div className="results-section">
      <div className="results-section-head">
        <h3>{title}</h3>
        {page && (
          <div className="pager">
            <button className="text-button" type="button" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
              {t.pagePrevious}
            </button>
            <span>
              {page.page}/{page.totalPages} · {page.total}
            </span>
            <button className="text-button" type="button" disabled={page.page >= page.totalPages} onClick={() => onPage(page.page + 1)}>
              {t.pageNext}
            </button>
          </div>
        )}
      </div>
      {responses.length === 0 ? (
        <div className="quiet-empty">{empty}</div>
      ) : (
        <div className="response-table-wrap">
          <table className="response-table">
            <thead>
              <tr>
                <th>{t.viewResponse}</th>
                <th>{t.submitted}</th>
                {form.fields.map((field) => (
                  <th key={field.id}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {responses.map((response) => (
                <tr key={response.id}>
                  <td>
                    <button className="text-button compact-action" type="button" disabled={opening === response.id} onClick={() => void open(response.id)}>
                      <Eye size={14} />
                      {t.viewResponse}
                    </button>
                  </td>
                  <td>{formatDate(response.createdAt)}</td>
                  {form.fields.map((field) => (
                    <td key={field.id}>{renderAnswer(response.answers[field.id], t.downloadAttachment)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResponseDetail({ form, response, close }: { form: Form; response: FormResponse; close: () => void }) {
  const { t } = useI18n();
  return (
    <section className="results-section response-detail">
      <div className="results-section-head">
        <div>
          <p className="eyebrow">{response.status}</p>
          <h3>{t.responseDetail}</h3>
        </div>
        <button className="text-button compact-action" type="button" onClick={close}>
          {t.closeDetail}
        </button>
      </div>
      <div className="response-detail-meta">
        <span>
          <strong>{t.submitted}</strong>
          {formatDate(response.createdAt)}
        </span>
        <span>
          <strong>{t.webhookStatus}</strong>
          {response.status}
        </span>
        <span>
          <strong>Client</strong>
          {response.clientId || '-'}
        </span>
      </div>
      <div className="response-detail-list">
        {form.fields.map((field) => (
          <div className="response-detail-row" key={field.id}>
            <strong>{field.label}</strong>
            <div>{renderAnswer(response.answers[field.id], t.downloadAttachment)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WebhookLog({ events, retry }: { events: WebhookEvent[]; retry: (eventId: string) => Promise<void> }) {
  const { t } = useI18n();
  const [retrying, setRetrying] = useState('');
  async function retryEvent(eventId: string) {
    setRetrying(eventId);
    try {
      await retry(eventId);
    } finally {
      setRetrying('');
    }
  }
  return (
    <div className="results-section">
      <div className="results-section-head">
        <h3>{t.webhookDeliveries}</h3>
      </div>
      {events.length === 0 ? (
        <div className="quiet-empty">{t.noWebhooks}</div>
      ) : (
        <div className="webhook-log-list">
          {events.map((event) => (
            <div className="webhook-log-row" key={event.id}>
              <span className={event.ok ? 'status-pill ok' : 'status-pill failed'}>{event.ok ? 'OK' : 'Failed'}</span>
              <strong>{event.status || '-'}</strong>
              <span>
                {event.message || t.webhookStatus}
                {event.attempts ? <small> · {event.attempts}</small> : null}
              </span>
              <time>{formatDate(event.lastAttemptAt || event.createdAt)}</time>
              {!event.ok && (
                <button className="text-button compact-action" type="button" disabled={retrying === event.id} onClick={() => void retryEvent(event.id)}>
                  {t.retryWebhook}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailLog({ events }: { events: EmailEvent[] }) {
  const { t } = useI18n();
  return (
    <div className="results-section">
      <div className="results-section-head">
        <h3>{t.emailDeliveries}</h3>
      </div>
      {events.length === 0 ? (
        <div className="quiet-empty">{t.noEmailEvents}</div>
      ) : (
        <div className="webhook-log-list">
          {events.map((event) => (
            <div className="webhook-log-row compact" key={event.id}>
              <span className={event.ok ? 'status-pill ok' : 'status-pill failed'}>{event.ok ? 'OK' : 'Failed'}</span>
              <Mail size={16} />
              <span>
                {event.message || t.webhookStatus}
                <small> · {event.to.join(', ')}</small>
              </span>
              <time>{formatDate(event.createdAt)}</time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderAnswer(value: AnswerValue, downloadLabel: string): React.ReactNode {
  const files = normalizeFiles(value);
  if (files.length) {
    return (
      <div className="attachment-result-list">
        {files.map((file, index) =>
          file.downloadUrl ? (
            <a key={`${file.name}-${index}`} href={file.downloadUrl} className="attachment-result-link">
              <Download size={14} />
              <span>{file.name}</span>
              <small>{downloadLabel}</small>
            </a>
          ) : (
            <span key={`${file.name}-${index}`}>{file.name}</span>
          )
        )}
      </div>
    );
  }
  return displayAnswer(value);
}

function formatBytes(value: number) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${Math.round((size / 1024 / 1024) * 10) / 10} MB`;
}

function SettingsPanel({
  form,
  updateDraft,
  saveDraft,
  onRestore
}: {
  form: Form;
  updateDraft: (updater: (current: Form) => Form) => void;
  saveDraft: (nextDraft?: Form | null) => void;
  onRestore: (form: Form) => void;
}) {
  const { t } = useI18n();
  const [versions, setVersions] = useState<FormVersion[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [backups, setBackups] = useState<MaintenanceEvent[]>([]);
  const [backupStatus, setBackupStatus] = useState('');
  const [smtpTo, setSmtpTo] = useState(form.settings.emailNotifications);
  const [smtpStatus, setSmtpStatus] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listVersions(form.id), api.listAuditEvents({ formId: form.id, limit: 50 }), api.listBackups()])
      .then(([nextVersions, nextAuditEvents, nextBackups]) => {
        if (cancelled) return;
        setVersions(nextVersions);
        setAuditEvents(nextAuditEvents);
        setBackups(nextBackups);
      })
      .catch(() => {
        if (cancelled) return;
        setVersions([]);
        setAuditEvents([]);
        setBackups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.id, form.updatedAt]);

  useEffect(() => {
    setSmtpTo(form.settings.emailNotifications);
    setSmtpStatus('');
  }, [form.id, form.settings.emailNotifications]);

  function updateSettings(patch: Partial<FormSettings>) {
    updateDraft((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }

  async function restoreVersion(versionId: string) {
    const restored = await api.restoreVersion(form.id, versionId);
    onRestore(restored);
    const [nextVersions, nextAuditEvents] = await Promise.all([api.listVersions(restored.id), api.listAuditEvents({ formId: restored.id, limit: 50 })]);
    setVersions(nextVersions);
    setAuditEvents(nextAuditEvents);
  }

  async function runBackup() {
    setBackupStatus('');
    try {
      const event = await api.runBackup();
      setBackups(await api.listBackups());
      setBackupStatus(event.ok ? t.backupCreated : t.backupFailed);
    } catch {
      setBackupStatus(t.backupFailed);
      setBackups(await api.listBackups().catch(() => backups));
    }
  }

  async function restoreBackup(backupId: string) {
    if (!window.confirm(t.confirmRestoreBackup)) return;
    setBackupStatus('');
    const event = await api.restoreBackup(backupId);
    setBackups(await api.listBackups());
    setBackupStatus(event.ok ? t.backupRestored : event.message || t.backupFailed);
    if (event.ok) window.location.reload();
  }

  async function testSmtp() {
    setSmtpTesting(true);
    setSmtpStatus('');
    try {
      const result = await api.testSmtp(smtpTo);
      setSmtpStatus(result.ok ? t.smtpTestSent : result.message);
    } catch (error) {
      setSmtpStatus(error && typeof error === 'object' && 'message' in error ? String(error.message) : t.saveFailed);
    } finally {
      setSmtpTesting(false);
    }
  }

  return (
    <section className="panel-page">
      <PanelIntro icon={<SlidersHorizontal size={20} />} title={t.settingsTitle} text={t.settingsText} />
      <div className="settings-grid">
        <label className="stack-label">
          {t.customSlug}
          <input value={form.settings.customSlug} onChange={(event) => updateSettings({ customSlug: event.target.value })} onBlur={() => saveDraft()} />
        </label>
        <label className="stack-label">
          {t.password}
          <input value={form.settings.password} onChange={(event) => updateSettings({ password: event.target.value })} onBlur={() => saveDraft()} />
        </label>
        <NumberInput label={t.submissionLimit} value={form.settings.submissionLimit} onChange={(submissionLimit) => updateSettings({ submissionLimit })} saveDraft={saveDraft} />
        <label className="stack-label">
          {t.closeAt}
          <input type="datetime-local" value={form.settings.closeAt} onChange={(event) => updateSettings({ closeAt: event.target.value })} onBlur={() => saveDraft()} />
        </label>
        <label className="stack-label">
          {t.emailNotifications}
          <input value={form.settings.emailNotifications} onChange={(event) => updateSettings({ emailNotifications: event.target.value })} onBlur={() => saveDraft()} />
        </label>
        <label className="stack-label">
          {t.webhookUrl}
          <input value={form.settings.webhookUrl} onChange={(event) => updateSettings({ webhookUrl: event.target.value })} onBlur={() => saveDraft()} />
        </label>
        <label className="stack-label">
          {t.webhookSecret}
          <input value={form.settings.webhookSecret} onChange={(event) => updateSettings({ webhookSecret: event.target.value })} onBlur={() => saveDraft()} />
        </label>
        <NumberInput label={t.dataRetentionDays} value={form.settings.dataRetentionDays} onChange={(dataRetentionDays) => updateSettings({ dataRetentionDays })} saveDraft={saveDraft} />
        <label className="stack-label">
          {t.verificationQuestion}
          <input value={form.settings.recaptchaQuestion} onChange={(event) => updateSettings({ recaptchaQuestion: event.target.value })} onBlur={() => saveDraft()} />
        </label>
        <label className="stack-label">
          {t.verificationAnswer}
          <input value={form.settings.recaptchaAnswer} onChange={(event) => updateSettings({ recaptchaAnswer: event.target.value })} onBlur={() => saveDraft()} />
        </label>
      </div>
      <div className="toggle-grid">
        <Toggle label={t.preventDuplicates} checked={form.settings.preventDuplicates} onChange={(preventDuplicates) => updateSettings({ preventDuplicates })} saveDraft={saveDraft} />
        <Toggle label={t.savePartials} checked={form.settings.partialSubmissions} onChange={(partialSubmissions) => updateSettings({ partialSubmissions })} saveDraft={saveDraft} />
        <Toggle label={t.removeBranding} checked={form.settings.removeBranding} onChange={(removeBranding) => updateSettings({ removeBranding })} saveDraft={saveDraft} />
      </div>
      <label className="stack-label wide">
        {t.successMessage}
        <textarea value={form.settings.successMessage} onChange={(event) => updateSettings({ successMessage: event.target.value })} onBlur={() => saveDraft()} rows={3} />
      </label>
      <label className="stack-label wide">
        {t.redirectUrl}
        <input value={form.settings.redirectUrl} onChange={(event) => updateSettings({ redirectUrl: event.target.value })} onBlur={() => saveDraft()} />
      </label>
      <section className="ops-panel smtp-test-panel">
        <div className="results-section-head">
          <h3>{t.testSmtp}</h3>
          <button className="text-button compact-action" type="button" disabled={smtpTesting} onClick={() => void testSmtp()}>
            <Mail size={15} />
            {t.testSmtp}
          </button>
        </div>
        <label className="stack-label">
          {t.testEmailTo}
          <input value={smtpTo} onChange={(event) => setSmtpTo(event.target.value)} />
        </label>
        {smtpStatus && <div className="status-note">{smtpStatus}</div>}
      </section>
      <BackupPanel backups={backups} status={backupStatus} runBackup={runBackup} restoreBackup={restoreBackup} />
      <OperationalHistory versions={versions} auditEvents={auditEvents} restore={restoreVersion} />
    </section>
  );
}

function BackupPanel({
  backups,
  status,
  runBackup,
  restoreBackup
}: {
  backups: MaintenanceEvent[];
  status: string;
  runBackup: () => Promise<void>;
  restoreBackup: (backupId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [restoring, setRestoring] = useState('');
  async function run() {
    setRunning(true);
    try {
      await runBackup();
    } finally {
      setRunning(false);
    }
  }
  async function restore(backupId: string) {
    setRestoring(backupId);
    try {
      await restoreBackup(backupId);
    } finally {
      setRestoring('');
    }
  }
  return (
    <section className="ops-panel backup-panel">
      <div className="results-section-head">
        <h3>{t.backupTitle}</h3>
        <button className="text-button compact-action" type="button" disabled={running} onClick={() => void run()}>
          <Files size={15} />
          {t.runBackup}
        </button>
      </div>
      {status && <div className="status-note">{status}</div>}
      {backups.length === 0 ? (
        <div className="quiet-empty small">{t.noBackups}</div>
      ) : (
        <div className="ops-list">
          {backups.map((backup) => (
            <div className="ops-row backup" key={backup.id}>
              <span>
                <strong>{backup.ok ? t.backupCreated : t.backupFailed}</strong>
                <small>{backup.message}</small>
              </span>
              <small>{formatBytes(backup.size)}</small>
              <time>{formatDate(backup.createdAt)}</time>
              {backup.ok && (
                <button className="text-button compact-action" type="button" disabled={restoring === backup.id} onClick={() => void restore(backup.id)}>
                  {t.restoreBackupAction}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OperationalHistory({
  versions,
  auditEvents,
  restore
}: {
  versions: FormVersion[];
  auditEvents: AuditEvent[];
  restore: (versionId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [restoring, setRestoring] = useState('');
  async function restoreOne(versionId: string) {
    setRestoring(versionId);
    try {
      await restore(versionId);
    } finally {
      setRestoring('');
    }
  }
  return (
    <div className="ops-grid">
      <section className="ops-panel">
        <div className="results-section-head">
          <h3>{t.versionsTitle}</h3>
        </div>
        {versions.length === 0 ? (
          <div className="quiet-empty small">{t.noVersions}</div>
        ) : (
          <div className="ops-list">
            {versions.map((version) => (
              <div className="ops-row" key={version.id}>
                <span>
                  <strong>{version.action}</strong>
                  <small>{version.title} · {version.fieldCount} {t.fields}</small>
                </span>
                <time>{formatDate(version.createdAt)}</time>
                <button className="text-button compact-action" type="button" disabled={restoring === version.id} onClick={() => void restoreOne(version.id)}>
                  {t.restoreVersion}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="ops-panel">
        <div className="results-section-head">
          <h3>{t.auditTitle}</h3>
        </div>
        {auditEvents.length === 0 ? (
          <div className="quiet-empty small">{t.noAuditEvents}</div>
        ) : (
          <div className="ops-list">
            {auditEvents.map((event) => (
              <div className="ops-row audit" key={event.id}>
                <span>
                  <strong>{event.action}</strong>
                  <small>{event.message}</small>
                </span>
                <time>{formatDate(event.createdAt)}</time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Toggle({ label, checked, onChange, saveDraft }: { label: string; checked: boolean; onChange: (value: boolean) => void; saveDraft: () => void }) {
  return (
    <label className="switch large">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        onBlur={() => saveDraft()}
      />
      <span>{label}</span>
    </label>
  );
}

function PanelIntro({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="panel-intro">
      <div className="brand-mark small">{icon}</div>
      <div>
        <p className="eyebrow">{title}</p>
        <h2>{text}</h2>
      </div>
    </div>
  );
}

function PublicForm({ formKey, navigate, embedded = false }: { formKey: string; navigate: (path: string) => void; embedded?: boolean }) {
  const { t } = useI18n();
  const [form, setForm] = useState<Form | null>(null);
  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [password, setPassword] = useState('');
  const [recaptcha, setRecaptcha] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'sent' | 'missing'>('loading');
  const clientId = useMemo(() => getClientId(), []);

  useEffect(() => {
    api
      .getPublicForm(formKey)
      .then((nextForm) => {
        if (!nextForm.published) {
          setState('missing');
          return;
        }
        const initialValues: Record<string, AnswerValue> = {};
        for (const field of nextForm.fields) {
          if (field.defaultValue) initialValues[field.id] = field.defaultValue;
          if (field.type === 'hidden') {
            const queryValue = new URLSearchParams(window.location.search).get(field.key);
            initialValues[field.id] = queryValue || field.defaultValue || '';
          }
        }
        setValues(initialValues);
        setForm(nextForm);
        setState('ready');
      })
      .catch(() => setState('missing'));
  }, [formKey]);

  useEffect(() => {
    if (!form?.settings.partialSubmissions || state !== 'ready') return;
    const handle = window.setTimeout(() => {
      void api.savePartial(form.id, { answers: values, clientId, password }).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(handle);
  }, [clientId, form, password, state, values]);

  function updateValue(fieldId: string, value: AnswerValue) {
    setValues((current) => ({ ...current, [fieldId]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;

    try {
      await api.submitResponse(form.id, { answers: values, clientId, password, recaptcha });
      setErrors({});
      if (form.settings.redirectUrl) {
        window.location.href = form.settings.redirectUrl;
        return;
      }
      setState('sent');
    } catch (error) {
      const nextErrors = error && typeof error === 'object' && 'errors' in error ? (error as { errors: Record<string, string> }).errors : {};
      if (error && typeof error === 'object' && 'message' in error) nextErrors.__form = String(error.message);
      setErrors(nextErrors);
    }
  }

  if (state === 'loading') return <div className="public-page loading">{t.loading}</div>;

  if (state === 'missing' || !form) {
    return (
      <div className="public-page missing">
        {!embedded && (
          <button className="back-button" onClick={() => navigate('/')}>
            <ArrowLeft size={17} />
            {t.back}
          </button>
        )}
        <h1>{t.notPublic}</h1>
      </div>
    );
  }

  if (state === 'sent') {
    return (
      <div className="public-page sent" style={themeVars(form)}>
        <div className="sent-mark">
          <Check size={28} />
        </div>
        <h1>{t.submittedDone}</h1>
        <p>{form.settings.successMessage}</p>
        {!embedded && (
          <button className="text-button" onClick={() => navigate('/')}>
            <ArrowLeft size={17} />
            {t.backToWorkspace}
          </button>
        )}
      </div>
    );
  }

  return (
    <main className={`public-page ${embedded ? 'embedded' : ''}`} style={themeVars(form)}>
      {!embedded && (
        <button className="back-button" onClick={() => navigate('/')}>
            <ArrowLeft size={17} />
          {t.workspace}
        </button>
      )}
      {!embedded && <LanguageButton className="public-language" />}
      <form className="public-form" onSubmit={submit}>
        {errors.__form && <div className="form-error">{errors.__form}</div>}
        {form.settings.password && (
          <label className="render-field password-field">
            <span>
              <Lock size={16} />
              {t.password}
            </span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
          </label>
        )}
        <FormRenderer form={form} values={values} errors={errors} onChange={updateValue} />
        {form.settings.recaptchaQuestion && (
          <label className="render-field recaptcha-field">
            <span>{form.settings.recaptchaQuestion}</span>
            <input value={recaptcha} onChange={(event) => setRecaptcha(event.target.value)} />
            {errors.__recaptcha && <small>{errors.__recaptcha}</small>}
          </label>
        )}
        <button className="submit-button" type="submit">
          <Send size={18} />
          {t.submit}
        </button>
        {!form.settings.removeBranding && <p className="powered">{t.poweredBy}</p>}
      </form>
      {form.theme.customCss && <style>{form.theme.customCss}</style>}
    </main>
  );
}

function themeVars(form: Form) {
  return {
    '--form-accent': form.theme.accent,
    '--form-bg': form.theme.background,
    '--form-surface': form.theme.surface,
    '--form-text': form.theme.text,
    '--form-radius': `${form.theme.radius}px`,
    '--form-font': form.theme.font
  } as React.CSSProperties;
}

function FormRenderer({
  form,
  values,
  errors,
  onChange,
  disabled = false
}: {
  form: Form;
  values: Record<string, AnswerValue>;
  errors: Record<string, string>;
  onChange: (fieldId: string, value: AnswerValue) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="form-renderer">
      <header>
        <h2>{pipeText(form.title, values, form.fields)}</h2>
        {form.description && <p>{pipeText(form.description, values, form.fields)}</p>}
      </header>

      {form.fields.map((field) => {
        if (!isVisible(field, values)) return null;
        if (field.type === 'hidden') return null;
        if (field.type === 'page_break') return <hr className="page-break" key={field.id} />;
        if (field.type === 'statement') {
          return (
            <div className="statement-block" key={field.id}>
              <h3>{pipeText(field.label, values, form.fields)}</h3>
              {field.description && <p>{pipeText(field.description, values, form.fields)}</p>}
            </div>
          );
        }
        if (field.type === 'calculated') {
          const value = calculateField(field, values, form.fields);
          return (
            <div className="calculated-block" key={field.id}>
              <span>{field.label}</span>
              <strong>{value}</strong>
            </div>
          );
        }
        if (field.type === 'payment') {
          return (
            <div className="payment-block" key={field.id}>
              <Sparkles size={18} />
              <span>{field.label}</span>
              <strong>
                {field.currency} {field.price}
              </strong>
              <small>{t.paymentNotice}</small>
            </div>
          );
        }
        return (
          <div className="render-field" key={field.id}>
            <span>
              {pipeText(field.label, values, form.fields)}
              {field.required && <b>*</b>}
            </span>
            {field.description && <em>{pipeText(field.description, values, form.fields)}</em>}
            <FieldInput field={field} value={values[field.id]} onChange={(value) => onChange(field.id, value)} disabled={disabled} />
            {errors[field.id] && <small>{errors[field.id]}</small>}
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled
}: {
  field: FormField;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  if (field.type === 'long_text') {
    return <textarea value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} disabled={disabled} rows={4} />;
  }

  if (field.type === 'dropdown') {
    return (
      <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        <option value="">{t.select}</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'multi_select') {
    const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    return (
      <select multiple value={selected} onChange={(event) => onChange(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))} disabled={disabled}>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'multiple_choice') {
    return (
      <div className="choice-group">
        {field.options.map((option) => (
          <label className="choice-option" key={option}>
            <input type="radio" name={field.id} checked={value === option} onChange={() => onChange(option)} disabled={disabled} />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }

  if (field.type === 'checkboxes' || field.type === 'ranking') {
    const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    return (
      <div className="choice-group">
        {field.options.map((option) => (
          <label className="choice-option" key={option}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))}
              disabled={disabled}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }

  if (field.type === 'rating') {
    return (
      <div className="rating-row">
        {Array.from({ length: Math.max(1, field.max - field.min + 1) }, (_, index) => field.min + index).map((score) => (
          <button type="button" key={score} className={String(value) === String(score) ? 'selected' : ''} onClick={() => onChange(String(score))} disabled={disabled}>
            {score}
          </button>
        ))}
      </div>
    );
  }

  if (field.type === 'linear_scale') {
    return (
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={typeof value === 'string' && value ? value : field.min}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    );
  }

  if (field.type === 'matrix') {
    const matrixValue = value && typeof value === 'object' && !Array.isArray(value) && !('dataUrl' in value) ? (value as Record<string, string>) : {};
    return (
      <div className="matrix-table">
        <div />
        {field.columns.map((column) => (
          <strong key={column}>{column}</strong>
        ))}
        {field.rows.map((row) => (
          <React.Fragment key={row}>
            <span>{row}</span>
            {field.columns.map((column) => (
              <input
                key={column}
                type="radio"
                name={`${field.id}-${row}`}
                checked={matrixValue[row] === column}
                onChange={() => onChange({ ...matrixValue, [row]: column })}
                disabled={disabled}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    );
  }

  if (field.type === 'file_upload' || field.type === 'signature') {
    return <AttachmentInput field={field} value={value} onChange={onChange} disabled={disabled} />;
  }

  const inputType =
    field.type === 'number'
      ? 'number'
      : field.type === 'email'
        ? 'email'
        : field.type === 'phone'
          ? 'tel'
          : field.type === 'url'
            ? 'url'
            : field.type === 'date'
              ? 'date'
              : field.type === 'time'
                ? 'time'
                : 'text';

  return <input type={inputType} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} disabled={disabled} />;
}

function AttachmentInput({
  field,
  value,
  onChange,
  disabled
}: {
  field: FormField;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  disabled?: boolean;
}) {
  const { t, lang } = useI18n();
  const files = normalizeFiles(value);
  const inputId = `${field.id}-upload`;
  const accept = field.type === 'signature' ? 'image/*' : 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip';
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const canUploadMore = files.length < 10;
  const chooseFilesLabel = lang === 'zh' ? '\u9078\u64c7\u6a94\u6848' : 'Choose files';
  const previewHint =
    lang === 'zh'
      ? '\u9019\u88e1\u53ea\u662f\u9810\u89bd\uff0c\u8acb\u5230\u53ef\u4e92\u52d5\u7684\u9810\u89bd\u5340\u6216\u516c\u958b\u9801\u6e2c\u8a66\u4e0a\u50b3\u3002'
      : 'Preview only. Use the interactive preview or public page to test uploads.';

  function openPicker() {
    if (disabled || !canUploadMore) return;
    inputRef.current?.click();
  }

  async function readFiles(fileList: FileList | null) {
    if (!fileList || disabled) return;
    const selected = Array.from(fileList).slice(0, Math.max(0, 10 - files.length));
    const nextFiles = await Promise.all(selected.map(readFileAnswer));
    onChange([...files, ...nextFiles].slice(0, 10));
  }

  function removeFile(index: number) {
    const nextFiles = files.filter((_file, fileIndex) => fileIndex !== index);
    onChange(nextFiles.length ? nextFiles : null);
  }

  return (
    <div className="attachment-control">
      <input
        id={inputId}
        ref={inputRef}
        className="attachment-native-input"
        type="file"
        accept={accept}
        multiple={field.type !== 'signature'}
        onChange={(event) => {
          void readFiles(event.target.files);
          event.target.value = '';
        }}
        disabled={disabled}
      />
      <div
        className={`attachment-dropzone${disabled ? ' is-disabled' : ''}${!canUploadMore ? ' is-full' : ''}`}
        role={disabled ? undefined : 'button'}
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || !canUploadMore}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
      >
        <span className="attachment-icon">
          <Upload size={20} />
        </span>
        <strong>{files.length ? t.addMoreFiles : t.uploadFiles}</strong>
        <button
          type="button"
          className="attachment-picker-button"
          onClick={(event) => {
            event.stopPropagation();
            openPicker();
          }}
          disabled={disabled || !canUploadMore}
        >
          {chooseFilesLabel}
        </button>
        <small>{disabled ? previewHint : t.fileHint}</small>
      </div>

      {files.length > 0 && (
        <div className="attachment-list">
          {files.map((file, index) => (
            <div className="attachment-item" key={`${file.name}-${index}`}>
              <Files size={17} />
              <span>
                <strong>{file.name}</strong>
                <small>{formatFileSize(file.size)}</small>
              </span>
              <button type="button" className="icon-button" title={t.removeFile} onClick={() => removeFile(index)} disabled={disabled}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function normalizeFiles(value: AnswerValue): FileAnswer[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is FileAnswer => isFileAnswer(item));
  }
  if (isFileAnswer(value)) return [value];
  return [];
}

function isFileAnswer(value: unknown): value is FileAnswer {
  return typeof value === 'object' && value !== null && 'name' in value && ('dataUrl' in value || 'downloadUrl' in value || 'attachmentId' in value);
}

function readFileAnswer(file: File): Promise<FileAnswer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: String(reader.result || '')
      });
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${Math.round((size / 1024 / 1024) * 10) / 10} MB`;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
