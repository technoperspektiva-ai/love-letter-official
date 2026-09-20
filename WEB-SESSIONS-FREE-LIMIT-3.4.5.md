# Love Letter Official 3.4.5

- `/weboff` blocks only new web authorizations. Existing authenticated browser sessions remain valid until logout or cookie expiry.
- `/webon` re-enables new web authorizations.
- Owner-only `/free` shows the current monthly free-letter package.
- Owner-only `/setfree N` changes the package globally (0..1000) and updates current-month rows immediately.
- The monthly limit is stored in D1 `app_settings.monthly_free_limit`; `MONTHLY_FREE_LIMIT` remains a fallback.
- Browser gate now checks for a valid existing `/api/account` session before showing the Telegram-only gate.
