# great-jarvis

Telegram bot: `@greatjarvis_bot`

Architecture:

`Telegram -> Cloudflare Worker -> OpenAI Responses API`

Model selector:

- GPT-5.6 (`gpt-5.6`)
- GPT-6 Astra (`gpt-6-astra`)

## 1. Install

```bash
npm install
npx wrangler login
```

## 2. Create KV for per-user model selection

```bash
npx wrangler kv namespace create USER_PREFS
```

Wrangler returns a namespace ID.

Open `wrangler.toml` and uncomment:

```toml
[[kv_namespaces]]
binding = "USER_PREFS"
id = "YOUR_KV_NAMESPACE_ID"
```

## 3. Add secrets

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Do not commit the real keys to GitHub.

## 4. Deploy

```bash
npm run deploy
```

The Worker name is already:

```text
great-jarvis
```

## 5. Set Telegram webhook

### PowerShell

```powershell
$env:TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN"
$env:WORKER_URL="https://great-jarvis.YOUR_SUBDOMAIN.workers.dev"
$env:TELEGRAM_WEBHOOK_SECRET="YOUR_RANDOM_SECRET"

npm run webhook:set
```

Then verify:

```powershell
npm run webhook:info
```

## Bot commands

```text
/start
/model
/current
/help
```

`/model` opens buttons:

- GPT-5.6
- GPT-6 Astra

The choice is stored per Telegram user in Cloudflare KV.

## Health check

Open:

```text
https://great-jarvis.YOUR_SUBDOMAIN.workers.dev/health
```

Expected:

```text
OK
```

## Logs

```bash
npm run tail
```

## Important

OpenAI API billing is separate from a ChatGPT subscription.
Access to a specific model also depends on what is enabled for your OpenAI API project/account.
