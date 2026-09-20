# Bot fix 3.3.3

- `/start`, `/support`, `/paysupport`, `/gift`, `/give` are handled by the Worker webhook.
- `/gift @username N` and `/give @username N` are owner-only for `@hodynnyk`.
- `sendMessage` now checks Telegram API errors instead of failing silently.
- `/api/telegram/status` shows bot/webhook diagnostics without exposing the bot token.
- `npm run bot:setup` reinstalls the webhook and command menu.
- `npm run bot:status` prints Telegram webhook state.

Required Worker secrets:
- `TELEGRAM_BOT_TOKEN`

After deploying, run `npm run bot:setup` with the same values in the environment so the webhook secret matches the Worker secret.
