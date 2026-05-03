# Mini Tally

A local Tally-like form collection app.

## Run

```bash
npm install
npm run build
npm run server
```

Open http://127.0.0.1:4177.

Use Node.js 22 or newer. The production data layer uses Node's built-in `node:sqlite` module, so no native SQLite package is required.

The management workspace is protected by an admin password. On first local run, open the app from `localhost` or `127.0.0.1` and create the password on screen. The public `/form/...` links still work without admin login.

## Admin Security

Management APIs, form editing, results, partial submissions, and CSV exports require an admin session. Public form loading and public submissions remain open for respondents.

For production hosting, set these environment variables before the first deploy:

```bash
ADMIN_PASSWORD="use-a-long-private-password"
ADMIN_SESSION_SECRET="use-a-long-random-secret"
NODE_ENV="production"
```

`ADMIN_PASSWORD` lets you log in without creating a local `data/admin.json` file. `ADMIN_SESSION_SECRET` keeps admin sessions valid after restarts. If you prefer the setup screen on a server, temporarily set `ALLOW_ADMIN_SETUP=true`, create the password immediately, then remove that variable.

Never commit `data/admin.json`, `data/forms.json`, `data/mini-tally.sqlite*`, or `data/uploads`. They can contain password hashes, submissions, and uploaded file data.

## Hostinger Deployment

This app needs Hostinger Node.js hosting, not static file hosting, because it has an Express API, a SQLite database, and private uploaded files.

Suggested hPanel settings:

- App type: Node.js
- Startup file: `app.js`
- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm start`
- Node version: 22+

Upload the project files without `node_modules`. The app listens on Hostinger's `PORT` environment variable automatically.

To create a clean Hostinger ZIP package:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-hostinger.ps1
```

To include your current local form data in the ZIP:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-hostinger.ps1 -IncludeLocalData
```

To create the ZIP and open hPanel plus the package location:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-hostinger.ps1 -OpenHostinger
```

For one-command SSH deployment, set these environment variables:

```powershell
$env:HOSTINGER_HOST="your-hostinger-ssh-host"
$env:HOSTINGER_USER="your-ssh-username"
$env:HOSTINGER_PORT="65002"
$env:HOSTINGER_PATH="/home/your-user/apps/mini-tally"
$env:HOSTINGER_APP_URL="https://your-domain.com"
$env:HOSTINGER_SSH_KEY="$env:USERPROFILE\.ssh\id_ed25519"
npm run deploy:hostinger
```

The current SSH deploy script builds the app, uploads a `.tar.gz` release to the Hostinger Node.js app folder, preserves the remote `data` folder unless `-IncludeLocalData` is used, backs up the full `data` folder before release install, keeps the latest 7 backups, touches `tmp/restart.txt`, and optionally checks `HOSTINGER_APP_URL` plus `/api/auth/me`.

Before deploying the protected workspace to Hostinger, make sure the Hostinger Node.js app has `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, and `NODE_ENV=production` configured. Otherwise the public forms will load, but the management workspace will not be ready for login from the public domain.

## Implemented

- Form workspace with Build, Logic, Design, Share, Results, and Settings tabs
- Public form links and iframe embed URLs
- Field types: short text, long text, email, number, phone, URL, date, time, dropdown, multiple choice, checkboxes, multi-select, file upload, signature upload, rating, linear scale, ranking, matrix, hidden field, calculated field, payment block, statement, page break
- Required fields, placeholders, descriptions, API keys, and options
- Conditional field visibility
- Answer piping with `{{field_key}}`
- Calculated fields with simple formulas
- Hidden fields from query parameters
- Password-protected forms
- Duplicate-submission prevention
- Submission limits and close date
- Simple verification question
- Partial submissions
- Response and partial-submission CSV export
- Theme editor and custom CSS
- Webhook posting with optional HMAC signature
- Webhook delivery log in the results workspace
- Local data retention cleanup
- SQLite storage with automatic legacy `forms.json` migration
- File uploads stored under `data/uploads` with protected admin downloads
- Result search, date filters, and paged response loading
- Basic rate limits on admin login/setup and public submission endpoints

## Local Limitations

Some Tally SaaS features need external services to be truly complete:

- Real payments need Stripe, PayPal, or another payment provider.
- Custom domains need DNS and hosting configuration.
- Email notifications need an SMTP or email API provider.
- Google Sheets, Slack, Airtable, Notion, and Zapier need OAuth/API credentials.
- Multi-user teams, workspaces, and billing need authentication and accounts.

## Data

Form definitions, submissions, partial submissions, answers, webhook logs, and admin config are stored in `data/mini-tally.sqlite`.

On first launch, if `data/mini-tally.sqlite` does not exist but `data/forms.json` exists, the server migrates the legacy JSON data into SQLite and creates a timestamped `data/forms.json.migrated-*.bak` backup. Existing public form URLs are preserved.

Uploaded files are stored in `data/uploads/<formId>/<responseId>/...`. The database stores only file metadata and relative paths. Attachment downloads require admin login.

Do not commit `data/mini-tally.sqlite*`, `data/uploads`, `data/admin.json`, or legacy `data/forms.json` because they may contain private response data.

## Backup And Restore

The SSH deploy script creates timestamped backups in `.deploy-backup-*` inside the Hostinger app folder before every release. Each backup contains the previous `data` folder, including `mini-tally.sqlite`, SQLite WAL/SHM sidecar files, uploads, and legacy admin/form JSON files.

To restore from SSH, stop the app from hPanel or touch restart after restore, then copy a backup data folder back into place:

```bash
cd /home/your-user/apps/mini-tally
cp -a .deploy-backup-YYYYMMDDHHMMSS/data ./data
touch tmp/restart.txt
```

Keep `data/mini-tally.sqlite`, `data/mini-tally.sqlite-wal`, `data/mini-tally.sqlite-shm`, and `data/uploads` together when moving or restoring production data.
