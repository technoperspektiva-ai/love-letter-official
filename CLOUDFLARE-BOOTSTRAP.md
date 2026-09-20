# Cloudflare bootstrap

## Why the dashboard said “Variables cannot be added to a Worker that only has static assets”

The first Cloudflare deployment was created before the repository contained its Worker config.
Cloudflare therefore treated the project as a static-assets-only Worker.

The repository now contains `wrangler.jsonc` and `worker/index.js`, and `wrangler.jsonc` declares:

```jsonc
"main": "./worker/index.js"
```

A proper Wrangler deployment creates a Worker + Static Assets project, so runtime variables and secrets are supported.

## GitHub Actions deployment

Repository variables:
- `D1_DATABASE_ID`
- `BOT_USERNAME`
- `APP_ORIGIN`
- `SUPPORT_CONTACT`

Repository secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

Then run: `Actions → Deploy to Cloudflare → Run workflow`.

Before the first deployment, create D1 once:

```bash
npx wrangler login
npx wrangler d1 create love-letter-official-db
```

Do not commit real tokens or secrets.
