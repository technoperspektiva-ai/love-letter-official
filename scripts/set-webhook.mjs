const token = process.env.TELEGRAM_BOT_TOKEN;
const workerUrl = process.env.WORKER_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !workerUrl || !secret) {
  console.error("Set TELEGRAM_BOT_TOKEN, WORKER_URL and TELEGRAM_WEBHOOK_SECRET.");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${workerUrl.replace(/\/$/, "")}/telegram`,
    secret_token: secret,
    drop_pending_updates: true,
    allowed_updates: ["message", "callback_query"]
  })
});

console.log(JSON.stringify(await response.json(), null, 2));
