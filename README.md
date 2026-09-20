# Love Letter Official

Premium Telegram Mini App for creating, purchasing and sharing animated digital letters.

## Product model

- **3 free published letters per Telegram user every calendar month**.
- After the monthly quota, each new letter uses a **bonus credit**, then a **paid credit**.
- Paid credits are purchased one-by-one with **Telegram Stars (`XTR`)**.
- **Invite a friend → +1 bonus letter** when that friend publishes their first letter.
- Referral bonus credits and purchased credits **do not expire**.
- Editing an existing unchosen letter does **not** consume a new credit.
- Once a recipient makes a choice, the story becomes read-only to preserve the agreement.
- Publishing is idempotent: a network retry cannot charge a second letter for the same publish action.

## Product experience

### Creator
- Telegram Mini App authentication — no login/password screen.
- Home dashboard with live credit balance, recent letters and referral CTA.
- Local draft autosave and resume.
- 3-step story-like creator: recipient → message → review.
- Ready-made romantic scenarios and writing suggestions.
- Four letter typography moods.
- Premium review with animated envelope and final paper preview.
- Library search, preview-as-recipient, edit, duplicate, share and delete.
- Profile with monthly, referral and paid balances.
- Native Telegram share, haptics and invoice flow.

### Recipient
- Public browser fallback `/l/:token` and Telegram `startapp=letter_<token>`.
- Animated envelope ritual.
- Paper unfold + staged text reveal.
- Four-option final choice.
- Choice is persisted once and immediately shown in the final state.
- The sender receives a Telegram notification when the recipient chooses.

## Monetization & referrals

The frontend never decides whether a letter is free or paid. The Worker atomically consumes credits in this order:

1. monthly free quota;
2. referral bonus;
3. purchased credit.

If no credit exists, `/api/stories` returns `402 LETTER_CREDIT_REQUIRED`.

Stars credits are granted **only** after Telegram sends a valid `successful_payment` webhook. `pre_checkout_query` never grants a credit.

Referral rewards are idempotent:
- one invited Telegram account can belong to only one inviter;
- self-referrals are ignored;
- +1 is granted only when the invited account publishes its first story.

## Architecture

```text
public/
  index.html
  app.css
  app.js
  data.js
  telegram-bridge.js
  brand/
worker/
  index.js
  telegram.js
  helpers.js
migrations/
scripts/
tests/
```

- **Cloudflare Worker** — API, Telegram auth, referrals, Stories, Stars, webhook.
- **Cloudflare D1** — user, quota, referral, story and payment state.
- **Cloudflare Static Assets** — Mini App and public recipient experience.
- **Telegram Bot API** — Mini App entry point, Stars and notifications.

## Security

Authenticated API requests send raw `Telegram.WebApp.initData`.
The Worker validates the Telegram HMAC-SHA-256 signature and rejects stale auth sessions.

The frontend never trusts a client-provided Telegram user ID.

Public letter tokens are random non-sequential tokens. Public endpoints expose only story content and the one-time recipient choice action.

## Local demo

The creator UI can be previewed on localhost:

```text
http://localhost:8000/?demo=1
```

Recipient demo:

```text
http://localhost:8000/?demo=1&letter=demo1
```

`DEV_BYPASS_AUTH` is local-only and must stay `false` in production.

Before production deploy run `npm run check:config`. GitHub CI runs syntax, unit and browser-flow tests.

## Version

`1.2.0`

See `DEPLOY.md` for launch steps.
