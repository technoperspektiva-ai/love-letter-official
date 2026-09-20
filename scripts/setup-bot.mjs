const token = process.env.TELEGRAM_BOT_TOKEN;
const origin = (process.env.APP_ORIGIN || "").replace(/\/$/, "");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !origin || !secret) {
  console.error("Required: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_ORIGIN");
  process.exit(1);
}

async function call(method, payload = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
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
    { command: "terms", description: "Умови сервісу" },
    { command: "privacy", description: "Приватність" },
    { command: "support", description: "Підтримка" },
    { command: "paysupport", description: "Підтримка платежів" }
  ]
});


await call("setMyDescription", {
  description: "Особисті цифрові листи з маленькою магією. 3 листи щомісяця безкоштовно, далі — Telegram Stars."
});

await call("setMyShortDescription", {
  short_description: "Створи лист, який хочеться зберегти 💌"
});

await call("setChatMenuButton", {
  menu_button: {
    type: "web_app",
    text: "💌 Love Letter",
    web_app: { url: origin }
  }
});

console.log(`Webhook: ${origin}/api/telegram/webhook`);
console.log(`Mini App URL: ${origin}`);
console.log("Done. In BotFather, also configure this bot as the Main Mini App for profile previews and startapp links.");
