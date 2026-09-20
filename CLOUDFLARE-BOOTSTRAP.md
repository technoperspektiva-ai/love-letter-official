# Cloudflare bootstrap

## Why the dashboard said “Variables cannot be added to a Worker that only has static assets”

The first Cloudflare deployment was created before the repository contained its Worker config.
Cloudflare therefore treated the project as a static-assets-only Worker.

The repository now contains:

- `wrangler.jsonc`
- `worker/index.js`
- D1 migrations
- a manual GitHub Actions deploy workflow

`wrangler.jsonc` explicitly declares:

```jsonc
"main": "./worker/index.js"
```

so the next proper Wrangler deployment is a real Worker + Static Assets deployment, and runtime variables/secrets are supported.

## Recommended deployment: GitHub Actions

Open:

`GitHub → love-letter-official → Settings → Secrets and variables → Actions`

### Repository variables

Create:

- `D1_DATABASE_ID`
- `BOT_USERNAME` — without `@`
- `APP_ORIGIN` — e.g. `https://love-letter-official.<account>.workers.dev`
- `SUPPORT_CONTACT` — e.g. `@your_support`

### Repository secrets

Create:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

The Cloudflare API token needs permissions to deploy Workers and manage the D1 database.

Then open:

`Actions → Deploy to Cloudflare → Run workflow`

The workflow will:

1. validate syntax;
2. render production values into the Wrangler config;
3. apply D1 migrations;
4. deploy Worker + static assets;
5. upload Telegram secrets as Worker secrets;
6. configure the Telegram webhook/menu;
7. verify `/api/health`.

## First-time D1 creation

Before the workflow can run successfully, create `love-letter-official-db` once and copy its database ID into the GitHub variable `D1_DATABASE_ID`.

Using Wrangler:

```bash
npx wrangler login
npx wrangler d1 create love-letter-official-db
```

## Manual alternative

After replacing the placeholders in `wrangler.jsonc`:

```bash
npm install --no-audit --no-fund
npm run test:syntax
npm run db:migrate:remote
npm run deploy
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npm run bot:setup
```

## Important

Do not commit a real Telegram bot token, webhook secret, or Cloudflare API token to GitHub.
