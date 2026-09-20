# Love Letter Official 3.1.1

Fixes:
- Telegram iOS now uses one deliberate internal vertical scroller instead of fighting document + nested scroll containers.
- Creator home scrolls inside `.ma-screen`.
- Wizard scrolls inside `.mw-main`, while the action bar stays stable.
- Telegram vertical swipe interception is disabled when the Telegram API supports it.
- Commerce modal is independently scrollable.
- Recipient story keeps natural page scrolling.
- In Telegram, old Service Workers are unregistered and ALL old Cache Storage entries are deleted once.
- If an old Service Worker still controls the page, the Mini App performs one cache-busting reload.
- HTML responses from the Worker are served with `no-store/no-cache` headers.
- Visible account sheet shows build `v3.1.1` so deployment freshness can be verified.
