# Cloudflare bootstrap

The first Cloudflare deployment may be detected as static-assets-only. This repository now contains a real Worker entry point in `wrangler.jsonc` (`main: ./worker/index.js`) plus static assets and D1.

Use GitHub Actions → **Deploy to Cloudflare** after configuring repository variables and secrets.

## Variables
- `D1_DATABASE_ID`
- `BOT_USERNAME` = `loveletter_official_bot`
- `APP_ORIGIN`
- `SUPPORT_CONTACT`

## Secrets
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

Never commit the bot token or Cloudflare API token to Git.
