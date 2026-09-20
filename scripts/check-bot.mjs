const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
async function call(method) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`);
  const d = await r.json();
  if (!d.ok) throw new Error(`${method}: ${d.description}`);
  return d.result;
}
const me = await call("getMe");
const hook = await call("getWebhookInfo");
console.log(JSON.stringify({ bot: `@${me.username}`, webhook: hook.url, pending: hook.pending_update_count, last_error_date: hook.last_error_date || null, last_error_message: hook.last_error_message || null }, null, 2));
