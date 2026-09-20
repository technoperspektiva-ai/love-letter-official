# Bot rebuild 3.3.4

- Owner access is pinned to Telegram numeric ID `375938798`.
- `/start` for owner shows admin commands and Mini App button.
- `/start` for regular users shows a friendly welcome message and a `💌 Розпочати Love Letter` Mini App button.
- `/help` responds for both owner and normal users.
- Unknown commands always get a reply.
- Every user who messages the bot is upserted into D1, so `/gift @username N` can find users after they simply press `/start`.
- BotFather command scopes are split: normal users see only user commands; owner chat sees admin commands.
- Callback query support was added for the admin help button.
