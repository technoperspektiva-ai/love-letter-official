# Love Letter Official 3.3.0 — Telegram Login + Commerce + Browser Compatibility

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
- responsive mobile/desktop UI;
- стабільний viewport/scroll у Safari, Chrome та Telegram WebView.

Додано для Telegram Mini App:
- Telegram Mini App initData auth через backend HMAC validation;
- Telegram Login для Safari/Chrome через підписану HttpOnly cookie-сесію;
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
- `LETTER_PRICE_XTR=25`
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


## 3.3.0 rules

- 3 нові листи кожного календарного місяця безкоштовно.
- Після ліміту: 1 лист = 25 Telegram Stars.
- 1 запрошений друг = +1 bonus letter лише після того, як друг сам створив хоча б 1 лист.
- Referral bonus не згорає при місячному reset.
- Safari/Chrome можуть увійти через Telegram Login і використовують той самий D1-профіль, що й Mini App.
- D1 database id: `3dba6dff-50ad-4875-8fe1-f6becf86df57`.
- R2 не використовується.

### Telegram Login domain

Для Login Widget у звичайному браузері в BotFather потрібно один раз виконати `/setdomain` для `@loveletter_official_bot` і вказати домен продакшн-сайту (`love-letter-official.black-sci-official.workers.dev` або ваш custom domain). Це обмеження Telegram, код Worker уже містить callback `/api/auth/telegram/callback`.


## Owner gift command (3.3.2)

Owner `@hodynnyk` can grant bonus letters by Telegram username:

`/gift @username 3`

The target must have logged in to Love Letter through Telegram at least once so their username exists in D1. Granted letters are stored in `bonus_credits` and do not expire with the monthly free-letter reset.
