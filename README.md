# Love Letter Official 3.1.0 — Original Product + Telegram Commerce

Це не спрощений rewrite. База — повний оригінальний Love Letter з його creator/mobile/desktop/recipient функціоналом.

Збережено з оригіналу:
- desktop і mobile creator;
- Ideas та готові сценарії;
- локальна бібліотека;
- чернетки/autosave;
- редагування існуючих листів через edit key;
- delete/regenerate link;
- recipient story flow;
- secret word, envelope, letter, choices, final;
- share PNG;
- word portrait/photo/media logic;
- PWA для звичайного браузера;
- responsive mobile/desktop UI.

Додано для Telegram Mini App:
- Telegram initData auth через backend HMAC validation;
- 3 безкоштовні НОВІ листи кожного календарного місяця;
- редагування вже створеного листа не витрачає credit;
- referral startapp: друг створив перший лист → +1 bonus credit;
- bonus credits не згорають;
- після quota — Telegram Stars;
- баланс monthly / referral / paid у самому original UI;
- webhook для pre_checkout_query та successful_payment;
- Telegram bot menu setup script;
- Telegram mode не використовує старий Service Worker cache.

## Required Worker secrets

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

## Existing production vars

`wrangler.jsonc` already contains:
- `BOT_USERNAME=loveletter_official_bot`
- `MONTHLY_FREE_LIMIT=3`
- `LETTER_PRICE_XTR=29`
- official Worker origin
- D1 binding for `love-letter-official-db`

## Deploy

```bash
npm install
npm run check
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npm run deploy
npm run bot:setup
```

Worker self-initializes all additional D1 tables/columns, so a separate migration command is not required for the Telegram commerce schema.


## 3.1.0 Commerce flow

- Original Love Letter creator/recipient experience stays intact.
- 3 new letters per calendar month are free for each Telegram user.
- Editing an existing letter does not consume another credit.
- After the monthly quota, referral bonus credits are consumed first, then paid credits.
- One qualified invited friend gives +1 non-expiring bonus letter.
- Extra letters are purchased one-by-one using Telegram Stars (XTR).
- Payment is credited only after Telegram sends `successful_payment` to the webhook.
- The Mini App polls payment state after native `openInvoice()` and refreshes the balance.
- Fixed the original share-image runtime typo: `canvas.toDataURL(...)`.
