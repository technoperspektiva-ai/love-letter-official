import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ["--check", "worker/index.js"], { stdio: "inherit" });
const html = fs.readFileSync("public/index.html", "utf8");
const scripts = [...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(Boolean);
for (let i = 0; i < scripts.length; i++) new vm.Script(scripts[i], { filename: `index-inline-${i}.js` });
if (!html.includes("telegram-commerce-bridge")) throw new Error("Telegram commerce bridge missing");
if (!html.includes("/api/payments/invoice")) throw new Error("Stars purchase flow missing");
console.log(`Inline scripts: ${scripts.length} PASS`);
if (html.includes("toDataпосилання")) throw new Error("Broken toDataURL identifier detected");
if (!html.includes("Купити +1 лист")) throw new Error("Visible Stars purchase CTA missing");
if (!html.includes("Запросити друга · отримати +1")) throw new Error("Visible referral CTA missing");
if (!html.includes("Мої покупки")) throw new Error("Visible purchases CTA missing");
if (!html.includes("/api/payments")) throw new Error("Payments history API usage missing");
if (!html.includes("Підтримка оплати")) throw new Error("Payment support CTA missing");
console.log("Love Letter Official 3.2.0 build: PASS");
