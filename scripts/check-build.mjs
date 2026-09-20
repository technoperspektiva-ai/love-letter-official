import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ["--check", "src/index.js"], { stdio: "inherit" });
const source = fs.readFileSync("src/index.js", "utf8");

const marker = "const APP_JS = String.raw`";
const start = source.indexOf(marker);
if (start < 0) throw new Error("APP_JS String.raw template not found");
const bodyStart = start + marker.length;
const end = source.indexOf("`;\n\nfunction shell()", bodyStart);
if (end < 0) throw new Error("APP_JS template end not found");

const client = source.slice(bodyStart, end);
if (client.includes("${")) throw new Error("APP_JS must not contain template interpolation");
new vm.Script(client, { filename: "embedded-app.js" });

console.log("Worker syntax: PASS");
console.log("Embedded Telegram client syntax: PASS");
