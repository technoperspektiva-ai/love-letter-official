import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const server = spawn("python", ["-m", "http.server", "8123", "--directory", "public"], { stdio:"ignore" });
await new Promise(r=>setTimeout(r,700));
const browser = await chromium.launch({ headless:true });

try {
  for (const [width,height] of [[320,740],[390,844],[430,932],[768,1024],[1440,900]]) {
    const page = await browser.newPage({ viewport:{width,height} });
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));

    await page.goto("http://127.0.0.1:8123/?demo=1");
    await page.waitForSelector(".hero");
    assert.equal(
      await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),
      0,
      `home horizontal overflow at ${width}`
    );

    await page.locator('[data-action="create"]').first().click();
    await page.locator('[data-bind="recipient"]').fill("Кохана");
    await page.locator('[data-action="wizard-next"]').click();
    await page.locator('[data-bind="message"]').fill("Тестовий теплий лист.");
    await page.locator('[data-action="wizard-next"]').click();
    await page.waitForSelector(".review-paper");
    assert.equal(
      await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),
      0,
      `wizard horizontal overflow at ${width}`
    );
    assert.deepEqual(errors,[]);
    await page.close();
  }

  // Recipient experience: envelope -> letter -> choice -> final.
  const recipient = await browser.newPage({ viewport:{width:390,height:844} });
  const recipientErrors=[];
  recipient.on("pageerror",e=>recipientErrors.push(e.message));
  await recipient.goto("http://127.0.0.1:8123/?demo=1&letter=demo1");
  await recipient.waitForSelector(".magic-envelope");
  await recipient.locator('[data-action="open-envelope"]').click();
  await recipient.waitForSelector(".recipient-letter");
  await recipient.locator('[data-action="recipient-choices"]').click();
  await recipient.waitForSelector('[data-action="choose"]');
  await recipient.locator('[data-action="choose"]').nth(1).click();
  await recipient.waitForSelector(".recipient-final");
  assert.match(await recipient.locator(".recipient-final").textContent(), /Прогулятися/);
  assert.equal(
    await recipient.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),
    0,
    "recipient horizontal overflow"
  );
  assert.deepEqual(recipientErrors,[]);
  await recipient.close();

  console.log("PASS UI product flows");
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
