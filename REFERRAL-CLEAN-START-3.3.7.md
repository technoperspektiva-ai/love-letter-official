# Love Letter 3.3.7 — referral bot flow

- Referral links now use `https://t.me/<bot>?start=ref_<code>`.
- `/start` payload is persisted to D1 before any cleanup.
- After the welcome/admin response is sent, the incoming `/start` message is deleted from the private chat when Telegram allows it.
- The bot leaves only the useful welcome message and Mini App button in the conversation.
- Owner check remains bound to Telegram ID `375938798`.
