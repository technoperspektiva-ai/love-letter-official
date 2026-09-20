# Love Letter Official 3.3.0

## Product changes
- 3 free new letters per calendar month.
- Every extra letter costs 25 Telegram Stars.
- Referral: inviter receives +1 bonus letter only after invited user creates their first letter.
- Telegram Login added for Safari/Chrome; Telegram Mini App keeps initData auth.
- Browser auth uses a signed HttpOnly cookie and the same D1 user/account.
- Mobile viewport and scroll behavior hardened for Safari, Chrome and Telegram WebView.
- R2 is not used.

## Existing D1
`3dba6dff-50ad-4875-8fe1-f6becf86df57`

## One-time Telegram setup
In BotFather, use `/setdomain` for `@loveletter_official_bot` and set the production site domain so Telegram Login Widget is allowed to authenticate there.
