# Love Letter 3.4.5

- Owner bot commands: `/free` and `/setfree <0..100>`.
- Monthly free limit stored in D1 `app_settings.monthly_free_limit`.
- `/setfree` applies to current month and future monthly packages.
- `/weboff` blocks only NEW web logins and new `/web` links.
- Existing authenticated browser sessions remain valid until logout/session expiry.
- Browser gate now checks an existing authenticated session before showing the Telegram-only gate.
