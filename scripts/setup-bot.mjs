const token = process.env.TELEGRAM_BOT_TOKEN;
const origin = (process.env.APP_ORIGIN || "https://love-letter-official.black-sci-official.workers.dev").replace(/\/$/, "");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is required");

async function call(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

const me = await call("getMe");
console.log(`Bot: @${me.username}`);
await call("setWebhook", {
  url: `${origin}/api/telegram/webhook`,
  secret_token: secret,
  allowed_updates: ["message", "pre_checkout_query"]
});
await call("setMyCommands", {
  commands: [
    { command: "start", description: "Відкрити Love Letter" },
    { command: "support", description: "Підтримка" },
    { command: "paysupport", description: "Підтримка платежів" }
  ]
});
await call("setMyDescription", { description: "Особисті цифрові листи з маленькою магією. 3 листи щомісяця безкоштовно." });
await call("setMyShortDescription", { short_description: "Створи лист, який хочеться зберегти 💌" });
await call("setChatMenuButton", {
  menu_button: { type: "web_app", text: "💌 Love Letter", web_app: { url: origin } }
});
console.log(`Webhook: ${origin}/api/telegram/webhook`);
console.log(`Mini App: ${origin}`);
