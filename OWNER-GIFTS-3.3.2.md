# Owner gifts — 3.3.2

Owner: `@hodynnyk`

Commands:
- `/gift @username 3` — grant 3 bonus letters
- `/give @username 1` — alias

Rules:
- only Telegram sender username `hodynnyk` may use the command;
- target is resolved case-insensitively from `telegram_users.username`;
- target must have logged in at least once;
- amount must be 1..1000;
- credits go to `bonus_credits`, so they do not reset monthly;
- owner and recipient both receive confirmation messages.
