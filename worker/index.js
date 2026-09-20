const VERSION = "3.1.0";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,x-edit-token,authorization,x-telegram-init-data"
};

const enc = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors }
  });
}

function randomId(len = 8) {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function randomToken(len = 28) {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function uid(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

function nextMonthISO() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function cfg(env) {
  return {
    appOrigin: String(env.APP_ORIGIN || "").replace(/\/$/, ""),
    botUsername: String(env.BOT_USERNAME || "loveletter_official_bot").replace(/^@/, ""),
    freeLimit: Math.max(0, Number(env.MONTHLY_FREE_LIMIT || 3)),
    letterPrice: Math.max(1, Number(env.LETTER_PRICE_XTR || 29)),
    authMaxAge: Math.max(60, Number(env.AUTH_MAX_AGE_SECONDS || 86400)),
    support: String(env.SUPPORT_CONTACT || "@loveletter_official_bot")
  };
}

async function sha256(text) {
  const bytes = enc.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key, data) {
  const rawKey = typeof key === "string" ? enc.encode(key) : key;
  const k = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

function hex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyInitData(raw, botToken, maxAge) {
  if (!raw) throw Object.assign(new Error("Відкрий Love Letter через Telegram-бота."), { status: 401, code: "NO_INIT_DATA" });
  if (!botToken) throw Object.assign(new Error("Telegram Bot Token ще не підключений."), { status: 503, code: "BOT_SECRET_MISSING" });

  const params = new URLSearchParams(raw);
  const given = params.get("hash");
  if (!given) throw Object.assign(new Error("Некоректна Telegram-сесія."), { status: 401, code: "NO_HASH" });
  params.delete("hash");

  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = await hmac("WebAppData", botToken);
  const expected = hex(await hmac(secret, dataCheck));
  if (expected !== given) throw Object.assign(new Error("Telegram-сесія не пройшла перевірку."), { status: 401, code: "BAD_HASH" });

  const authDate = Number(params.get("auth_date") || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || nowSec - authDate > maxAge) {
    throw Object.assign(new Error("Telegram-сесія застаріла. Закрий і відкрий Mini App ще раз."), { status: 401, code: "AUTH_EXPIRED" });
  }

  let user = null;
  try { user = JSON.parse(params.get("user") || "null"); } catch {}
  if (!user?.id) throw Object.assign(new Error("Не вдалося прочитати Telegram-профіль."), { status: 401, code: "NO_USER" });

  return { user, startParam: params.get("start_param") || "" };
}

async function authenticate(request, env) {
  if (String(env.DEV_BYPASS_AUTH || "").toLowerCase() === "true") {
    const raw = request.headers.get("x-debug-user");
    if (raw) return { user: JSON.parse(raw), startParam: request.headers.get("x-debug-start") || "" };
  }

  const auth = request.headers.get("authorization") || "";
  const direct = request.headers.get("x-telegram-init-data") || "";
  const raw = auth.startsWith("tma ") ? auth.slice(4) : direct;
  return verifyInitData(raw, env.TELEGRAM_BOT_TOKEN, cfg(env).authMaxAge);
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error("D1 binding DB is not available");

  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS stories (" +
    "id TEXT PRIMARY KEY, " +
    "payload TEXT NOT NULL, " +
    "created_at INTEGER NOT NULL, " +
    "edit_token TEXT" +
    ")"
  ).run();

  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_stories_created_at ON stories(created_at)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_stories_edit_token ON stories(edit_token)").run();

  const storyInfo = await env.DB.prepare("PRAGMA table_info(stories)").all();
  const storyCols = new Set((storyInfo.results || []).map(r => r.name));
  if (!storyCols.has("owner_telegram_id")) await env.DB.prepare("ALTER TABLE stories ADD COLUMN owner_telegram_id TEXT").run();
  if (!storyCols.has("credit_source")) await env.DB.prepare("ALTER TABLE stories ADD COLUMN credit_source TEXT").run();

  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS telegram_users (" +
    "telegram_id TEXT PRIMARY KEY, username TEXT, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '', " +
    "photo_url TEXT, language_code TEXT, ref_code TEXT NOT NULL UNIQUE, referred_by TEXT, " +
    "bonus_credits INTEGER NOT NULL DEFAULT 0, paid_credits INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_users_ref_code ON telegram_users(ref_code)").run();

  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS monthly_usage (telegram_id TEXT NOT NULL, month_key TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, free_limit INTEGER NOT NULL DEFAULT 3, updated_at INTEGER NOT NULL, PRIMARY KEY(telegram_id,month_key))"
  ).run();

  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS referrals (id TEXT PRIMARY KEY, inviter_id TEXT NOT NULL, invited_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, qualified_at INTEGER)"
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id,status)").run();

  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, invoice_payload TEXT NOT NULL UNIQUE, stars INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', telegram_payment_charge_id TEXT UNIQUE, provider_payment_charge_id TEXT, created_at INTEGER NOT NULL, paid_at INTEGER, refunded_at INTEGER)"
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(telegram_id,created_at DESC)").run();
}

async function ensureUser(env, tg, startParam = "") {
  const id = String(tg.id);
  const t = Date.now();
  let user = await env.DB.prepare("SELECT * FROM telegram_users WHERE telegram_id=?").bind(id).first();

  if (!user) {
    let ref = Math.random().toString(36).slice(2, 9).toUpperCase();
    for (let i = 0; i < 5; i++) {
      const exists = await env.DB.prepare("SELECT 1 FROM telegram_users WHERE ref_code=?").bind(ref).first();
      if (!exists) break;
      ref = Math.random().toString(36).slice(2, 10).toUpperCase();
    }

    await env.DB.prepare(
      "INSERT INTO telegram_users (telegram_id,username,first_name,last_name,photo_url,language_code,ref_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
    ).bind(
      id,
      tg.username || null,
      tg.first_name || "",
      tg.last_name || "",
      tg.photo_url || null,
      tg.language_code || null,
      ref,
      t,
      t
    ).run();

    user = await env.DB.prepare("SELECT * FROM telegram_users WHERE telegram_id=?").bind(id).first();
  } else {
    await env.DB.prepare(
      "UPDATE telegram_users SET username=?,first_name=?,last_name=?,photo_url=?,language_code=?,updated_at=? WHERE telegram_id=?"
    ).bind(tg.username || null, tg.first_name || "", tg.last_name || "", tg.photo_url || null, tg.language_code || null, t, id).run();
  }

  if (startParam.startsWith("ref_") && !user.referred_by) {
    const inviter = await env.DB.prepare("SELECT telegram_id FROM telegram_users WHERE ref_code=?").bind(startParam.slice(4)).first();
    if (inviter && String(inviter.telegram_id) !== id) {
      const ins = await env.DB.prepare(
        "INSERT OR IGNORE INTO referrals (id,inviter_id,invited_id,status,created_at) VALUES (?,?,?,'pending',?)"
      ).bind(uid("ref"), String(inviter.telegram_id), id, t).run();
      if ((ins.meta?.changes || 0) > 0) {
        await env.DB.prepare("UPDATE telegram_users SET referred_by=?,updated_at=? WHERE telegram_id=? AND referred_by IS NULL")
          .bind(String(inviter.telegram_id), t, id).run();
      }
    }
  }

  return env.DB.prepare("SELECT * FROM telegram_users WHERE telegram_id=?").bind(id).first();
}

async function ensureMonth(env, userId) {
  const c = cfg(env);
  const key = monthKey();
  const t = Date.now();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO monthly_usage (telegram_id,month_key,used,free_limit,updated_at) VALUES (?,?,0,?,?)"
  ).bind(userId, key, c.freeLimit, t).run();
  await env.DB.prepare(
    "UPDATE monthly_usage SET free_limit=?,updated_at=? WHERE telegram_id=? AND month_key=?"
  ).bind(c.freeLimit, t, userId, key).run();
  return env.DB.prepare("SELECT * FROM monthly_usage WHERE telegram_id=? AND month_key=?").bind(userId, key).first();
}

async function accountSnapshot(env, userId) {
  const c = cfg(env);
  const user = await env.DB.prepare("SELECT * FROM telegram_users WHERE telegram_id=?").bind(userId).first();
  const month = await ensureMonth(env, userId);
  const monthlyRemaining = Math.max(0, Number(month.free_limit) - Number(month.used));
  const letters = await env.DB.prepare("SELECT COUNT(*) AS n FROM stories WHERE owner_telegram_id=?").bind(userId).first();
  const q = await env.DB.prepare("SELECT COUNT(*) AS n FROM referrals WHERE inviter_id=? AND status='qualified'").bind(userId).first();
  const p = await env.DB.prepare("SELECT COUNT(*) AS n FROM referrals WHERE inviter_id=? AND status='pending'").bind(userId).first();

  return {
    user: {
      id: userId,
      username: user?.username || "",
      firstName: user?.first_name || "",
      lastName: user?.last_name || "",
      photoUrl: user?.photo_url || "",
      refCode: user?.ref_code || ""
    },
    credits: {
      monthlyLimit: Number(month.free_limit),
      monthlyUsed: Number(month.used),
      monthlyRemaining,
      bonus: Number(user?.bonus_credits || 0),
      paid: Number(user?.paid_credits || 0),
      totalAvailable: monthlyRemaining + Number(user?.bonus_credits || 0) + Number(user?.paid_credits || 0),
      resetsAt: nextMonthISO()
    },
    referrals: {
      qualified: Number(q?.n || 0),
      pending: Number(p?.n || 0),
      link: `https://t.me/${c.botUsername}?startapp=ref_${user?.ref_code || ""}`
    },
    pricing: { letterStars: c.letterPrice, currency: "XTR" },
    letters: Number(letters?.n || 0),
    botUsername: c.botUsername
  };
}

async function consumeCredit(env, userId) {
  const t = Date.now();
  const key = monthKey();
  await ensureMonth(env, userId);

  const monthly = await env.DB.prepare(
    "UPDATE monthly_usage SET used=used+1,updated_at=? WHERE telegram_id=? AND month_key=? AND used<free_limit"
  ).bind(t, userId, key).run();
  if ((monthly.meta?.changes || 0) > 0) return "monthly";

  const bonus = await env.DB.prepare(
    "UPDATE telegram_users SET bonus_credits=bonus_credits-1,updated_at=? WHERE telegram_id=? AND bonus_credits>0"
  ).bind(t, userId).run();
  if ((bonus.meta?.changes || 0) > 0) return "bonus";

  const paid = await env.DB.prepare(
    "UPDATE telegram_users SET paid_credits=paid_credits-1,updated_at=? WHERE telegram_id=? AND paid_credits>0"
  ).bind(t, userId).run();
  if ((paid.meta?.changes || 0) > 0) return "paid";

  return null;
}

async function restoreCredit(env, userId, source) {
  const t = Date.now();
  if (source === "monthly") {
    await env.DB.prepare("UPDATE monthly_usage SET used=MAX(used-1,0),updated_at=? WHERE telegram_id=? AND month_key=?")
      .bind(t, userId, monthKey()).run();
  } else if (source === "bonus") {
    await env.DB.prepare("UPDATE telegram_users SET bonus_credits=bonus_credits+1,updated_at=? WHERE telegram_id=?").bind(t, userId).run();
  } else if (source === "paid") {
    await env.DB.prepare("UPDATE telegram_users SET paid_credits=paid_credits+1,updated_at=? WHERE telegram_id=?").bind(t, userId).run();
  }
}

async function sendBotText(env, chatId, text, htmlMode = false) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...(htmlMode ? { parse_mode: "HTML" } : {}) })
  });
}

async function rewardReferral(env, invitedId) {
  const row = await env.DB.prepare("SELECT * FROM referrals WHERE invited_id=? AND status='pending'").bind(invitedId).first();
  if (!row) return;
  const t = Date.now();
  const up = await env.DB.prepare("UPDATE referrals SET status='qualified',qualified_at=? WHERE id=? AND status='pending'").bind(t, row.id).run();
  if ((up.meta?.changes || 0) > 0) {
    await env.DB.prepare("UPDATE telegram_users SET bonus_credits=bonus_credits+1,updated_at=? WHERE telegram_id=?")
      .bind(t, row.inviter_id).run();
    sendBotText(env, row.inviter_id, "💌 Твій друг створив перший Love Letter. +1 безкоштовний лист уже на балансі.").catch(() => {});
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") return "invalid_payload";
  const raw = JSON.stringify(payload);
  if (raw.length > 400000) return "payload_too_large";
  return "";
}

async function health(env) {
  try {
    await ensureSchema(env);
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM stories").first();
    return json({ ok: true, db: true, stories: Number(row?.count || 0), version: VERSION });
  } catch (error) {
    return json({ ok: false, db: false, error: String(error?.message || error), version: VERSION }, 500);
  }
}

async function authenticatedUser(request, env) {
  const a = await authenticate(request, env);
  const user = await ensureUser(env, a.user, a.startParam || "");
  return { a, user, userId: String(user.telegram_id) };
}

async function createStory(request, env) {
  await ensureSchema(env);
  let auth;
  try { auth = await authenticatedUser(request, env); }
  catch (error) { return json({ error: error.code || "auth_error", message: error.message }, error.status || 401); }

  const body = await request.json();
  const payload = body?.payload;
  const invalid = validatePayload(payload);
  if (invalid) {
    return json({
      error: invalid,
      message: invalid === "payload_too_large"
        ? "Фото слишком большое. Выбери другое фото или убери его."
        : "Некорректные данные письма."
    }, invalid === "payload_too_large" ? 413 : 400);
  }

  const creditSource = await consumeCredit(env, auth.userId);
  if (!creditSource) {
    const snapshot = await accountSnapshot(env, auth.userId);
    return json({
      error: "letter_credit_required",
      code: "LETTER_CREDIT_REQUIRED",
      message: "Три безкоштовні листи цього місяця вже використані. Запроси друга або придбай ще один лист у Telegram Stars.",
      account: snapshot
    }, 402);
  }

  let id = "";
  for (let i = 0; i < 6; i++) {
    const candidate = randomId(8);
    const exists = await env.DB.prepare("SELECT id FROM stories WHERE id = ?").bind(candidate).first();
    if (!exists) { id = candidate; break; }
  }
  if (!id) {
    await restoreCredit(env, auth.userId, creditSource);
    return json({ error: "id_generation_failed" }, 500);
  }

  const editKey = randomToken(30);
  const editHash = await sha256(editKey);
  const raw = JSON.stringify(payload);

  try {
    await env.DB.prepare(
      "INSERT INTO stories (id,payload,created_at,edit_token,owner_telegram_id,credit_source) VALUES (?,?,?,?,?,?)"
    ).bind(id, raw, Date.now(), editHash, auth.userId, creditSource).run();
  } catch (error) {
    await restoreCredit(env, auth.userId, creditSource);
    throw error;
  }

  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM stories WHERE owner_telegram_id=?").bind(auth.userId).first();
  if (Number(count?.n || 0) === 1) await rewardReferral(env, auth.userId);

  return json({
    ok: true,
    id,
    path: `/l/${id}`,
    editPath: `/edit/${id}#key=${editKey}`,
    editKey,
    creditSource,
    account: await accountSnapshot(env, auth.userId)
  }, 201);
}

async function getStory(id, env) {
  await ensureSchema(env);
  const row = await env.DB.prepare("SELECT payload FROM stories WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "not_found" }, 404);
  try { return json({ ok: true, payload: JSON.parse(row.payload) }); }
  catch { return json({ error: "corrupt_story" }, 500); }
}

async function updateStory(request, id, env) {
  await ensureSchema(env);
  const editKey = request.headers.get("x-edit-token") || "";
  if (!editKey) return json({ error: "missing_edit_token" }, 401);

  const row = await env.DB.prepare("SELECT edit_token FROM stories WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "not_found" }, 404);
  if (!row.edit_token) return json({ error: "not_editable" }, 403);

  const hash = await sha256(editKey);
  if (hash !== row.edit_token) return json({ error: "invalid_edit_token" }, 403);

  const body = await request.json();
  const payload = body?.payload;
  const invalid = validatePayload(payload);
  if (invalid) {
    return json({
      error: invalid,
      message: invalid === "payload_too_large"
        ? "Фото слишком большое. Выбери другое фото или убери его."
        : "Некорректные данные письма."
    }, invalid === "payload_too_large" ? 413 : 400);
  }

  await env.DB.prepare("UPDATE stories SET payload = ? WHERE id = ?").bind(JSON.stringify(payload), id).run();
  return json({ ok: true, id, path: `/l/${id}` });
}

async function authorizeEdit(id, editKey, env) {
  await ensureSchema(env);
  if (!editKey) return { ok: false, status: 401, error: "missing_edit_token" };
  const row = await env.DB.prepare("SELECT edit_token,payload FROM stories WHERE id = ?").bind(id).first();
  if (!row) return { ok: false, status: 404, error: "not_found" };
  if (!row.edit_token) return { ok: false, status: 403, error: "not_editable" };
  const hash = await sha256(editKey);
  if (hash !== row.edit_token) return { ok: false, status: 403, error: "invalid_edit_token" };
  return { ok: true, row };
}

async function deleteStory(request, id, env) {
  const editKey = request.headers.get("x-edit-token") || "";
  const auth = await authorizeEdit(id, editKey, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  await env.DB.prepare("DELETE FROM stories WHERE id = ?").bind(id).run();
  return json({ ok: true, deleted: id });
}

async function regenerateStoryUrl(request, id, env) {
  const editKey = request.headers.get("x-edit-token") || "";
  const auth = await authorizeEdit(id, editKey, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let newId = "";
  for (let i = 0; i < 6; i++) {
    const candidate = randomId(8);
    const exists = await env.DB.prepare("SELECT id FROM stories WHERE id = ?").bind(candidate).first();
    if (!exists) { newId = candidate; break; }
  }
  if (!newId) return json({ error: "id_generation_failed" }, 500);

  await env.DB.prepare("UPDATE stories SET id = ? WHERE id = ?").bind(newId, id).run();
  return json({ ok: true, oldId: id, id: newId, path: `/l/${newId}`, editPath: `/edit/${newId}#key=${editKey}` });
}

async function telegramCall(env, method, payload = {}) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || method);
  return data.result;
}

async function createInvoice(request, env) {
  await ensureSchema(env);
  let auth;
  try { auth = await authenticatedUser(request, env); }
  catch (error) { return json({ error: error.code || "auth_error", message: error.message }, error.status || 401); }

  const c = cfg(env);
  const id = uid("pay");
  const payload = `loveletter:${id}:${auth.userId}`;
  const t = Date.now();
  await env.DB.prepare("INSERT INTO payments (id,telegram_id,invoice_payload,stars,status,created_at) VALUES (?,?,?,?,'pending',?)")
    .bind(id, auth.userId, payload, c.letterPrice, t).run();

  const invoiceUrl = await telegramCall(env, "createInvoiceLink", {
    title: "Ще один Love Letter",
    description: "1 додатковий цифровий лист",
    payload,
    currency: "XTR",
    prices: [{ label: "Love Letter", amount: c.letterPrice }]
  });

  return json({ ok: true, paymentId: id, invoiceUrl, stars: c.letterPrice });
}

async function paymentStatus(request, env, id) {
  let auth;
  try { auth = await authenticatedUser(request, env); }
  catch (error) { return json({ error: error.code || "auth_error", message: error.message }, error.status || 401); }
  const row = await env.DB.prepare("SELECT id,status,stars,created_at,paid_at FROM payments WHERE id=? AND telegram_id=?")
    .bind(id, auth.userId).first();
  return row ? json({ ok: true, payment: row }) : json({ error: "not_found" }, 404);
}

async function accountApi(request, env) {
  await ensureSchema(env);
  let auth;
  try { auth = await authenticatedUser(request, env); }
  catch (error) { return json({ error: error.code || "auth_error", message: error.message }, error.status || 401); }
  return json({ ok: true, ...(await accountSnapshot(env, auth.userId)) });
}

async function webhook(request, env) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) return json({ error: "forbidden" }, 403);

  const update = await request.json();
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const payment = await env.DB.prepare("SELECT * FROM payments WHERE invoice_payload=?").bind(q.invoice_payload).first();
    const valid = payment && payment.status === "pending" && String(payment.telegram_id) === String(q.from?.id) && q.currency === "XTR" && Number(q.total_amount) === Number(payment.stars);
    await telegramCall(env, "answerPreCheckoutQuery", {
      pre_checkout_query_id: q.id,
      ok: Boolean(valid),
      ...(valid ? {} : { error_message: "Цей платіж більше недоступний." })
    });
    return json({ ok: true });
  }

  const message = update.message;
  if (message?.successful_payment) {
    const p = message.successful_payment;
    const payment = await env.DB.prepare("SELECT * FROM payments WHERE invoice_payload=?").bind(p.invoice_payload).first();
    if (payment && payment.status === "pending" && p.currency === "XTR" && Number(p.total_amount) === Number(payment.stars)) {
      const t = Date.now();
      const up = await env.DB.prepare(
        "UPDATE payments SET status='paid',telegram_payment_charge_id=?,provider_payment_charge_id=?,paid_at=? WHERE id=? AND status='pending'"
      ).bind(p.telegram_payment_charge_id, p.provider_payment_charge_id || null, t, payment.id).run();
      if ((up.meta?.changes || 0) > 0) {
        await env.DB.prepare("UPDATE telegram_users SET paid_credits=paid_credits+1,updated_at=? WHERE telegram_id=?").bind(t, payment.telegram_id).run();
        sendBotText(env, payment.telegram_id, "⭐ Оплату підтверджено. +1 лист уже на балансі.").catch(() => {});
      }
    }
    return json({ ok: true });
  }

  if (message?.text && message?.chat?.id) {
    const command = message.text.split(/\s+/)[0].toLowerCase();
    if (command === "/start") {
      await sendBotText(env, message.chat.id, "💌 Love Letter\n\nСтвори особистий цифровий лист. Перші 3 листи щомісяця — безкоштовно.");
    } else if (command === "/support" || command === "/paysupport") {
      await sendBotText(env, message.chat.id, `Підтримка Love Letter: ${cfg(env).support}`);
    }
  }

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      if (url.pathname === "/api/health" && request.method === "GET") return await health(env);
      if (url.pathname === "/api/account" && request.method === "GET") return await accountApi(request, env);
      if (url.pathname === "/api/payments/invoice" && request.method === "POST") return await createInvoice(request, env);
      if (url.pathname.startsWith("/api/payments/") && request.method === "GET") return await paymentStatus(request, env, url.pathname.split("/").pop());
      if (url.pathname === "/api/telegram/webhook" && request.method === "POST") return await webhook(request, env);

      if (url.pathname === "/api/story" && request.method === "POST") return await createStory(request, env);

      const apiMatch = url.pathname.match(/^\/api\/story\/([A-Za-z0-9_-]{4,32})$/);
      if (apiMatch && request.method === "GET") return await getStory(apiMatch[1], env);
      if (apiMatch && request.method === "PUT") return await updateStory(request, apiMatch[1], env);
      if (apiMatch && request.method === "DELETE") return await deleteStory(request, apiMatch[1], env);

      const regenerateMatch = url.pathname.match(/^\/api\/story\/([A-Za-z0-9_-]{4,32})\/regenerate$/);
      if (regenerateMatch && request.method === "POST") return await regenerateStoryUrl(request, regenerateMatch[1], env);

      if (/^\/l\/[A-Za-z0-9_-]{4,32}\/?$/.test(url.pathname) || /^\/edit\/[A-Za-z0-9_-]{4,32}\/?$/.test(url.pathname)) {
        return env.ASSETS.fetch(request);
      }

      if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return json({ error: "server_error", message: String(err?.message || err) }, 500);
    }
  }
};
