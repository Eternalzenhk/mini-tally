# Mini Tally

A local Tally-like form collection app.

## Run

```bash
npm install
npm run build
npm run server
```

Open http://127.0.0.1:4177.

## Hostinger Deployment

This app needs Hostinger Node.js hosting, not static file hosting, because it has an Express API and stores form data in `data/forms.json`.

Suggested hPanel settings:

- App type: Node.js
- Startup file: `app.js`
- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm start`
- Node version: 20+ if available

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

The SSH deploy script builds the app, uploads a release package, keeps `data/forms.json` in a shared folder, activates the new release, restarts `pm2` when available, and optionally checks `HOSTINGER_APP_URL`.

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
- Local data retention cleanup

## Local Limitations

Some Tally SaaS features need external services to be truly complete:

- Real payments need Stripe, PayPal, or another payment provider.
- Custom domains need DNS and hosting configuration.
- Email notifications need an SMTP or email API provider.
- Google Sheets, Slack, Airtable, Notion, and Zapier need OAuth/API credentials.
- Multi-user teams, workspaces, and billing need authentication and accounts.

## Data

Form definitions, submissions, partial submissions, and webhook logs are stored in `data/forms.json`.
