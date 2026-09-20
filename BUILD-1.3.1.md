# Love Letter Official 1.3.1

- Telegram build drops stale Service Worker caches.
- API bootstrap detects non-JSON/static responses.
- Worker self-initializes D1 schema on first API request.
- Production deploy runs automatically on push to main.
- D1 migration API permission is no longer a deploy blocker.
- Current remaining external requirement: Cloudflare API token must allow Workers Scripts Edit; D1 Edit is recommended for migrations.
