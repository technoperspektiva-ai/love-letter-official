# Love Letter 3.4.4

## Telegram web authorization

The browser version now uses Telegram OpenID Connect Authorization Code Flow + PKCE.

Cloudflare variables:
- `TELEGRAM_LOGIN_CLIENT_ID` — normal variable
- `TELEGRAM_LOGIN_CLIENT_SECRET` — secret

BotFather Login Widget / Allowed URLs must include:
- `https://love-letter-official.black-sci-official.workers.dev`
- `https://love-letter-official.black-sci-official.workers.dev/api/auth/telegram/oidc/callback`

Flow: website -> Telegram OAuth -> callback -> verified ID token -> secure `ll_tg_session` cookie -> redirect back to Love Letter. The requested scopes are `openid profile phone telegram:bot_access`.

## Owner commands
Owner Telegram ID: `375938798`.
- `/webon` — enable browser access
- `/weboff` — disable browser access
- `/stats` — total users, online in last 5 minutes, bot users, web-login users

## Statistics
Admin settings now show total registered users, authenticated users active in the last 5 minutes, users who interacted with the bot, and users who completed web Telegram login. Presence is refreshed every 45 seconds while an authenticated Love Letter page is visible.
