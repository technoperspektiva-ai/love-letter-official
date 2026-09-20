import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyTelegramInitData } from "../worker/telegram.js";
import { monthKey, nextMonthIso, safeStoryPayload } from "../worker/helpers.js";

const botToken = "123456789:TEST_TOKEN";
const user = { id: 42, first_name: "Maxwell", username: "demo" };
const authDate = Math.floor(Date.now()/1000);
const params = new URLSearchParams({
  auth_date: String(authDate),
  query_id: "AAE-demo",
  start_param: "ref_abc123",
  user: JSON.stringify(user)
});
const dataCheck = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
const hash = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
params.set("hash", hash);

const verified = await verifyTelegramInitData(params.toString(), botToken, 86400);
assert.equal(verified.user.id, 42);
assert.equal(verified.startParam, "ref_abc123");

const tampered = new URLSearchParams(params);
tampered.set("start_param", "ref_hacker");
await assert.rejects(() => verifyTelegramInitData(tampered.toString(), botToken, 86400));

const story = safeStoryPayload({
  recipient:"Кохана",
  message:"Привіт",
  choices:[{emoji:"☕",title:"Кава"}],
  font:"romantic"
});
assert.equal(story.recipient, "Кохана");
assert.equal(story.choices.length, 4);
assert.equal(story.font, "romantic");
assert.match(monthKey(), /^\d{4}-\d{2}$/);
assert.match(nextMonthIso(), /^\d{4}-\d{2}-01T00:00:00\.000Z$/);

console.log("PASS backend unit tests");
