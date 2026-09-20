# Love Letter Official 3.3.0 — Payments UI

Added:
- polished Telegram Stars purchase UI inside the existing balance sheet;
- “Мої покупки” screen with recent purchases and localized status badges;
- each purchase shows +1 Love Letter, date/time, Stars amount and status;
- payment support button opens the bot with `/paysupport`;
- backend `GET /api/payments` returns only the authenticated Telegram user’s own purchases;
- payment history uses server-side Telegram authorization;
- paid credit is still issued only after Telegram `successful_payment`;
- payment UI remains scrollable inside Telegram Mini App.

No original Love Letter creator/recipient features were removed.
