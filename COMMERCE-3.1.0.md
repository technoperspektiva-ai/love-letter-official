# Love Letter Official 3.1.0 — Telegram Commerce

Product rules:
- 3 free NEW letters per Telegram user each calendar month.
- Existing-letter edits are free.
- Referral: invited user publishes their first letter -> inviter receives +1 bonus letter.
- Referral credits do not expire.
- When free/bonus credits are exhausted, +1 letter is sold for `LETTER_PRICE_XTR` Telegram Stars.
- Default price: 25 XTR.
- Payment credit is issued only from Telegram `successful_payment`, never from a frontend callback.
- Duplicate successful payment processing is protected by payment status + unique charge id.
- Bot webhook endpoint: `/api/telegram/webhook`.
- Required secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.

Visible Mini App behavior:
- Balance button shows total available letters.
- Account sheet shows monthly / referral / paid balances.
- Quota exhaustion opens the purchase/referral sheet automatically.
- Native Telegram `openInvoice()` is used for Stars checkout.
