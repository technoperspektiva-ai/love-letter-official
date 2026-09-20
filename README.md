# Love Letter Official 2.0.0

A clean Worker-only Telegram Mini App rebuild.

## Why this build is different

- No Cloudflare Static Assets binding.
- No Service Worker.
- No separate frontend deploy.
- One Worker serves the UI and API from the same script.
- D1 schema self-initializes on the first API request.
- Telegram initData is validated server-side.
- 3 free letters per calendar month.
- Referral +1 after the invited friend publishes their first letter.
- Extra letter purchase via Telegram Stars.
- Public recipient flow with one-time choice.

## Required GitHub secrets

- CLOUDFLARE_API_TOKEN — must have Workers Scripts: Edit. D1: Edit is required by the runtime DB binding/account access.
- CLOUDFLARE_ACCOUNT_ID
- TELEGRAM_BOT_TOKEN
- TELEGRAM_WEBHOOK_SECRET (optional; workflow generates one if missing)

## Deploy

Push to `main`. The `Deploy Production` workflow deploys automatically.

## Health

`GET /api/health` should return version `2.0.0`.
