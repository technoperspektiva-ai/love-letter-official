const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN.");
  process.exit(1);
}
const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
console.log(JSON.stringify(await response.json(), null, 2));
