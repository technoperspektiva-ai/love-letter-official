# Love Letter Official

Telegram Mini App for creating, purchasing and sharing animated digital letters.

## Product model
- 3 free published letters per Telegram user every calendar month.
- After the monthly quota: referral bonus credits, then paid credits.
- Extra letters are purchased with Telegram Stars (XTR).
- Invite a friend → +1 bonus letter after the friend publishes their first letter.
- Referral and paid credits do not expire.
- Editing an existing unchosen letter does not consume a new credit.
- Publishing is idempotent so a network retry cannot charge the same publish action twice.

## Version
1.2.0

The complete 1.2.0 source package is prepared for Cloudflare Workers + D1 + Telegram Mini Apps.