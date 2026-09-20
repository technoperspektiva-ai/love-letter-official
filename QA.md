# QA — Love Letter Official 1.2.0

## Executed in this build

- Node syntax: `worker/index.js`, `worker/telegram.js`, `public/app.js`, `public/telegram-bridge.js`, `scripts/setup-bot.mjs` — PASS.
- Backend unit tests — PASS.
- Telegram Mini App HMAC validation + tamper rejection — PASS.
- Story payload normalization — PASS.
- D1 migrations `0001`, `0002`, `0003` applied to a clean SQLite database — PASS.
- Idempotency column/index in `stories` — PASS.
- UI harness with Chromium at 320×740, 390×844, 430×932, 768×1024, 1440×900 — PASS.
- Home horizontal overflow — 0 px on all tested widths.
- Creator wizard through Review horizontal overflow — 0 px on all tested widths.
- Recipient flow envelope → letter → choices → final — PASS.
- Recipient selection persisted in demo flow (`Прогулятися`) — PASS.
- Browser page errors in tested flows — 0.

## Production checks that require account credentials

These cannot be truthfully executed without the real Telegram bot and Cloudflare account:

- Telegram `initData` from the production bot;
- Bot webhook delivery;
- live Telegram Stars purchase and `successful_payment` webhook;
- remote Cloudflare D1 migration/deploy;
- BotFather Main Mini App registration.

The code and setup scripts for those flows are included in the project.
