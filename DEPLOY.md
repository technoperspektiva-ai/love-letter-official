# Deploy Love Letter Official

## What is already implemented

The project is production-shaped. You only need infrastructure values and Telegram credentials.

- GitHub / project name: `love-letter-official`
- Worker: `love-letter-official`
- D1: `love-letter-official-db`
- Monthly free quota: `3`
- Default extra-letter price: `29 ⭐`

## 1. Create the Telegram bot

Create a bot with **@BotFather** and keep the token private.

Recommended username:

```text
@love_letter_official_bot
```

If that username is unavailable, use another one and update `BOT_USERNAME`.

## 2. Create D1

```bash
npx wrangler d1 create love-letter-official-db
```

Copy the returned `database_id` into `wrangler.jsonc`.

## 3. Configure public vars

In `wrangler.jsonc` set:

- `BOT_USERNAME`
- `APP_ORIGIN`
- `SUPPORT_CONTACT`

Business defaults can stay:

```text
MONTHLY_FREE_LIMIT=3
LETTER_PRICE_XTR=29
AUTH_MAX_AGE_SECONDS=86400
DEV_BYPASS_AUTH=false
```

## 4. Add secrets

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Use a long random webhook secret.

## 5. Apply D1 migrations

```bash
npm run db:migrate:remote
```

## 6. Deploy

```bash
npm run deploy
```

Copy the final HTTPS Worker URL to `APP_ORIGIN`, then deploy once more.

## 7. Configure the bot

```bash
TELEGRAM_BOT_TOKEN='...' TELEGRAM_WEBHOOK_SECRET='...' APP_ORIGIN='https://love-letter-official.<account>.workers.dev' npm run bot:setup
```

The setup script configures:

- webhook;
- `/start`;
- `/terms`;
- `/privacy`;
- `/support`;
- `/paysupport`;
- chat menu button → Mini App.

Then in **BotFather → Bot Settings → Configure Mini App**, set the same `APP_ORIGIN` as the **Main Mini App**.

## 8. Verify launch

Check:

```text
GET /api/health
```

Expected:

```json
{"ok":true,"db":true,"version":"1.2.0"}
```

Then verify inside Telegram:

1. user identity appears automatically;
2. new user has 3 monthly free letters;
3. first story publishes without payment;
4. public recipient link opens;
5. recipient choice appears in sender notification;
6. referral link contains `?startapp=ref_<code>`;
7. invited friend publishes first story → inviter gets +1;
8. after quota + bonuses + paid credits reach zero → Stars paywall;
9. successful Stars payment → +1 paid credit;
10. edit of an unchosen letter consumes no credit;
11. chosen letter is read-only.

## Important

Do **not** set `DEV_BYPASS_AUTH=true` in production.

Digital goods inside Telegram must use Telegram Stars. Do not replace the in-Mini-App payment flow with an external card checkout.
