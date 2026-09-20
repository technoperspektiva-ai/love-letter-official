import fs from "node:fs";

const raw = fs.readFileSync("wrangler.jsonc", "utf8");
const problems = [];
for (const marker of ["REPLACE_WITH_BOT_USERNAME", "REPLACE_WITH_WORKER_DOMAIN", "REPLACE_WITH_D1_DATABASE_ID", "@replace_support"]) {
  if (raw.includes(marker)) problems.push(marker);
}
if (/"DEV_BYPASS_AUTH"\s*:\s*"true"/i.test(raw)) problems.push("DEV_BYPASS_AUTH=true");

if (problems.length) {
  console.error("Production config is not ready:");
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log("Production config check: PASS");
