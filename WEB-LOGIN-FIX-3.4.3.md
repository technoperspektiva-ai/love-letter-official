# Love Letter 3.4.3 — Web login fix

- `/web` now opens a server-side consume URL.
- Worker validates the one-time token, sets `ll_tg_session` directly, and redirects to the home page.
- No client-side `?web_auth=` handoff is required for `/web`.
- Better Safari/Chrome reliability.
