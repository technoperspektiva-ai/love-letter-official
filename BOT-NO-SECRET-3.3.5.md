# 3.3.5 — Telegram webhook без secret

- Прибрано залежність від `TELEGRAM_WEBHOOK_SECRET`.
- `/api/telegram/webhook` приймає Telegram updates без secret header.
- Додано `GET /api/telegram/setup`: один клік встановлює webhook і команди бота.
- `/api/telegram/status` показує актуальний webhook.
- Admin Telegram ID: `375938798`.

Після деплою відкрийте:
`https://love-letter-official.black-sci-official.workers.dev/api/telegram/setup`

Потім відкрийте бота та натисніть `/start`.
