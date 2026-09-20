# WEB COMMAND 3.4.1

Added Telegram bot command `/web`.

Behavior:
- `/web` is available to regular users and the owner.
- Bot replies with a `🌐 Відкрити веб-версію` URL button.
- The button opens `APP_ORIGIN` / the current Love Letter web site.
- `/web` is registered in both the default BotFather command scope and the owner chat scope by `/api/telegram/setup`.
- Browser availability is still controlled by the owner browser-access setting in the app.
