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
console.log("Love Letter Official 3.0.0 build: PASS");
