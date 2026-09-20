import { AuthError, answerPreCheckout, createStarsInvoiceLink, telegramApi, verifyTelegramInitData } from "./telegram.js";
import { clampText, errorJson, id, json, monthKey, nextMonthIso, nowMs, safeStoryPayload, token } from "./helpers.js";

const APP_VERSION = "1.3.1";

let schemaInitPromise = null;

async function ensureSchema(env) {
  if (!env.DB) throw new Error("D1 binding DB is missing");
  if (schemaInitPromise) return schemaInitPromise;

  schemaInitPromise = (async () => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS telegram_users (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        photo_url TEXT,
        language_code TEXT,
        ref_code TEXT NOT NULL UNIQUE,
        referred_by TEXT,
        bonus_credits INTEGER NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0),
        paid_credits INTEGER NOT NULL DEFAULT 0 CHECK (paid_credits >= 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (referred_by) REFERENCES telegram_users(telegram_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_users_ref_code ON telegram_users(ref_code)`,
      `CREATE TABLE IF NOT EXISTS monthly_usage (
        telegram_id TEXT NOT NULL,
        month_key TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
        free_limit INTEGER NOT NULL DEFAULT 3 CHECK (free_limit >= 0),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (telegram_id, month_key),
        FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS referrals (
        id TEXT PRIMARY KEY,
        inviter_id TEXT NOT NULL,
        invited_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rejected')),
        created_at INTEGER NOT NULL,
        qualified_at INTEGER,
        UNIQUE (inviter_id, invited_id),
        FOREIGN KEY (inviter_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
        FOREIGN KEY (invited_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id, status)`,
      `CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        public_token TEXT NOT NULL UNIQUE,
        owner_telegram_id TEXT NOT NULL,
        recipient TEXT NOT NULL,
        title TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        credit_source TEXT NOT NULL CHECK (credit_source IN ('monthly','bonus','paid')),
        client_request_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (owner_telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_stories_owner ON stories(owner_telegram_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_stories_public ON stories(public_token)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_owner_request ON stories(owner_telegram_id, client_request_id)`,
      `CREATE TABLE IF NOT EXISTS story_choices (
        story_id TEXT PRIMARY KEY,
        choice_index INTEGER NOT NULL,
        chosen_at INTEGER NOT NULL,
        FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        telegram_id TEXT NOT NULL,
        invoice_payload TEXT NOT NULL UNIQUE,
        stars INTEGER NOT NULL CHECK (stars > 0),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','canceled','refunded','failed')),
        telegram_payment_charge_id TEXT UNIQUE,
        provider_payment_charge_id TEXT,
        created_at INTEGER NOT NULL,
        paid_at INTEGER,
        refunded_at INTEGER,
        FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(telegram_id, created_at DESC)`
    ];

    for (const sql of statements) await env.DB.prepare(sql).run();

    const userInfo = await env.DB.prepare("PRAGMA table_info(telegram_users)").all();
    const userColumns = new Set((userInfo.results || []).map(row => row.name));
    if (!userColumns.has("terms_accepted_at")) {
      await env.DB.prepare("ALTER TABLE telegram_users ADD COLUMN terms_accepted_at INTEGER").run();
    }

    const storyInfo = await env.DB.prepare("PRAGMA table_info(stories)").all();
    const storyColumns = new Set((storyInfo.results || []).map(row => row.name));
    if (!storyColumns.has("client_request_id")) {
      await env.DB.prepare("ALTER TABLE stories ADD COLUMN client_request_id TEXT").run();
      await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_owner_request ON stories(owner_telegram_id, client_request_id)").run();
    }
  })();

  try {
    await schemaInitPromise;
  } catch (error) {
    schemaInitPromise = null;
    throw error;
  }
}

function config(env) {
  return {
    freeLimit: Math.max(0, Number(env.MONTHLY_FREE_LIMIT || 3)),
    letterPrice: Math.max(1, Number(env.LETTER_PRICE_XTR || 29)),
    authMaxAge: Math.max(60, Number(env.AUTH_MAX_AGE_SECONDS || 86400)),
    botUsername: String(env.BOT_USERNAME || "").replace(/^@/, ""),
    appName: env.APP_NAME || "Love Letter"
  };
}

async function parseJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function authHeader(request) {
  const raw = request.headers.get("authorization") || "";
  return raw.startsWith("tma ") ? raw.slice(4) : "";
}

async function authenticate(request, env) {
  if (String(env.DEV_BYPASS_AUTH || "").toLowerCase() === "true") {
    const raw = request.headers.get("x-debug-telegram-user");
    if (raw) {
      const user = JSON.parse(raw);
      if (!user?.id) throw new AuthError("Invalid debug user");
      return { user, startParam: request.headers.get("x-debug-start-param") || null, debug: true };
    }
  }
  return verifyTelegramInitData(authHeader(request), env.TELEGRAM_BOT_TOKEN, config(env).authMaxAge);
}

async function ensureUser(env, tgUser, startParam = null) {
  const telegramId = String(tgUser.id);
  const now = nowMs();
  let row = await env.DB.prepare("SELECT * FROM telegram_users WHERE telegram_id=?").bind(telegramId).first();

  if (!row) {
    let refCode = token(7);
    for (let i = 0; i < 5; i++) {
      const exists = await env.DB.prepare("SELECT 1 FROM telegram_users WHERE ref_code=?").bind(refCode).first();
      if (!exists) break;
      refCode = token(8);
    }
    await env.DB.prepare(`
      INSERT INTO telegram_users
      (telegram_id, username, first_name, last_name, photo_url, language_code, ref_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      telegramId,
      tgUser.username || null,
      tgUser.first_name || "",
      tgUser.last_name || "",
      tgUser.photo_url || null,
      tgUser.language_code || null,
      refCode,
      now,
      now
    ).run();
    row = await env.DB.prepare("SELECT * FROM telegram_users WHERE telegram_id=?").bind(telegramId).first();
  } else {
    await env.DB.prepare(`
      UPDATE telegram_users
      SET username=?, first_name=?, last_name=?, photo_url=?, language_code=?, updated_at=?
      WHERE telegram_id=?
    `).bind(
      tgUser.username || null,
      tgUser.first_name || "",
      tgUser.last_name || "",
      tgUser.photo_url || null,
      tgUser.language_code || null,
      now,
      telegramId
    ).run();
  }

  if (startParam?.startsWith("ref_") && !row.referred_by) {
    const refCode = startParam.slice(4).trim();
    const inviter = await env.DB.prepare("SELECT telegram_id FROM telegram_users WHERE ref_code=?").bind(refCode).first();
    if (inviter && String(inviter.telegram_id) !== telegramId) {
      const referralId = id("ref");
      const inserted = await env.DB.prepare(`
        INSERT OR IGNORE INTO referrals (id, inviter_id, invited_id, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
      `).bind(referralId, String(inviter.telegram_id), telegramId, now).run();
      if ((inserted.meta?.changes || 0) > 0) {
        await env.DB.prepare("UPDATE telegram_users SET referred_by=?, updated_at=? WHERE telegram_id=? AND referred_by IS NULL")
          .bind(String(inviter.telegram_id), now, telegramId).run();
      }
    }
  }

  return await env.DB.prepare("SELECT * FROM telegram_users WHERE telegram_id=?").bind(telegramId).first();
}

async function ensureMonthlyUsage(env, telegramId) {
  const cfg = config(env);
  const key = monthKey();
  const now = nowMs();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO monthly_usage (telegram_id, month_key, used, free_limit, updated_at)
    VALUES (?, ?, 0, ?, ?)
  `).bind(telegramId, key, cfg.freeLimit, now).run();
  // If the global free limit changes, new/current month follows it without rewriting history.
  await env.DB.prepare("UPDATE monthly_usage SET free_limit=?, updated_at=? WHERE telegram_id=? AND month_key=?")
    .bind(cfg.freeLimit, now, telegramId, key).run();
  return await env.DB.prepare("SELECT * FROM monthly_usage WHERE telegram_id=? AND month_key=?")
    .bind(telegramId, key).first();
}

async function accountSnapshot(env, telegramId) {
  const cfg = config(env);
  const user = await env.DB.prepare("SELECT * FROM telegram_users WHERE telegram_id=?").bind(telegramId).first();
  const usage = await ensureMonthlyUsage(env, telegramId);
  const monthlyRemaining = Math.max(0, Number(usage.free_limit) - Number(usage.used));
  const qualified = await env.DB.prepare("SELECT COUNT(*) AS count FROM referrals WHERE inviter_id=? AND status='qualified'")
    .bind(telegramId).first();
  const pending = await env.DB.prepare("SELECT COUNT(*) AS count FROM referrals WHERE inviter_id=? AND status='pending'")
    .bind(telegramId).first();
  const storyCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM stories WHERE owner_telegram_id=?")
    .bind(telegramId).first();

  const referralLink = cfg.botUsername
    ? `https://t.me/${cfg.botUsername}?startapp=ref_${user.ref_code}`
    : null;

  return {
    user: {
      id: telegramId,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      photoUrl: user.photo_url,
      refCode: user.ref_code,
      termsAccepted: Boolean(user.terms_accepted_at)
    },
    credits: {
      monthlyLimit: Number(usage.free_limit),
      monthlyUsed: Number(usage.used),
      monthlyRemaining,
      bonus: Number(user.bonus_credits || 0),
      paid: Number(user.paid_credits || 0),
      totalAvailable: monthlyRemaining + Number(user.bonus_credits || 0) + Number(user.paid_credits || 0),
      resetsAt: nextMonthIso()
    },
    referrals: {
      qualified: Number(qualified?.count || 0),
      pending: Number(pending?.count || 0),
      link: referralLink
    },
    pricing: { letterStars: cfg.letterPrice, currency: "XTR" },
    stories: Number(storyCount?.count || 0),
    botUsername: cfg.botUsername
  };
}

async function consumeCredit(env, telegramId) {
  const key = monthKey();
  const usage = await ensureMonthlyUsage(env, telegramId);
  const now = nowMs();

  const monthly = await env.DB.prepare(`
    UPDATE monthly_usage SET used=used+1, updated_at=?
    WHERE telegram_id=? AND month_key=? AND used < free_limit
  `).bind(now, telegramId, key).run();
  if ((monthly.meta?.changes || 0) > 0) return "monthly";

  const bonus = await env.DB.prepare(`
    UPDATE telegram_users SET bonus_credits=bonus_credits-1, updated_at=?
    WHERE telegram_id=? AND bonus_credits > 0
  `).bind(now, telegramId).run();
  if ((bonus.meta?.changes || 0) > 0) return "bonus";

  const paid = await env.DB.prepare(`
    UPDATE telegram_users SET paid_credits=paid_credits-1, updated_at=?
    WHERE telegram_id=? AND paid_credits > 0
  `).bind(now, telegramId).run();
  if ((paid.meta?.changes || 0) > 0) return "paid";

  return null;
}

async function refundCredit(env, telegramId, source) {
  const now = nowMs();
  if (source === "monthly") {
    await env.DB.prepare(`UPDATE monthly_usage SET used=MAX(used-1,0), updated_at=? WHERE telegram_id=? AND month_key=?`)
      .bind(now, telegramId, monthKey()).run();
  } else if (source === "bonus") {
    await env.DB.prepare("UPDATE telegram_users SET bonus_credits=bonus_credits+1, updated_at=? WHERE telegram_id=?")
      .bind(now, telegramId).run();
  } else if (source === "paid") {
    await env.DB.prepare("UPDATE telegram_users SET paid_credits=paid_credits+1, updated_at=? WHERE telegram_id=?")
      .bind(now, telegramId).run();
  }
}

async function qualifyReferral(env, invitedId) {
  const referral = await env.DB.prepare("SELECT * FROM referrals WHERE invited_id=? AND status='pending'")
    .bind(invitedId).first();
  if (!referral) return false;
  const now = nowMs();
  const update = await env.DB.prepare(`
    UPDATE referrals SET status='qualified', qualified_at=?
    WHERE id=? AND status='pending'
  `).bind(now, referral.id).run();
  if ((update.meta?.changes || 0) === 0) return false;
  await env.DB.prepare("UPDATE telegram_users SET bonus_credits=bonus_credits+1, updated_at=? WHERE telegram_id=?")
    .bind(now, referral.inviter_id).run();
  sendBotText(
    env,
    referral.inviter_id,
    "💌 <b>Твій друг створив перший Love Letter.</b>\n\nНа балансі вже +1 бонусний лист. Він не згорає.",
    true
  ).catch(error => console.warn("Referral notification failed", error));
  return true;
}

async function handleSession(request, env, auth) {
  const startParam = auth.startParam || null;
  const user = await ensureUser(env, auth.user, startParam);
  const account = await accountSnapshot(env, String(user.telegram_id));
  return json({ ok: true, version: APP_VERSION, ...account, startParam });
}

async function handleStoriesList(env, telegramId) {
  const result = await env.DB.prepare(`
    SELECT s.id, s.public_token, s.recipient, s.title, s.created_at, s.updated_at,
           s.credit_source, sc.choice_index, sc.chosen_at
    FROM stories s
    LEFT JOIN story_choices sc ON sc.story_id=s.id
    WHERE s.owner_telegram_id=?
    ORDER BY s.created_at DESC LIMIT 100
  `).bind(telegramId).all();
  return json({ ok: true, stories: result.results || [] });
}

async function handleCreateStory(request, env, telegramId) {
  const body = await parseJson(request);
  const payload = safeStoryPayload(body.payload || body);
  const clientRequestId = clampText(body.clientRequestId, 96, "") || null;
  const cfg = config(env);

  if (clientRequestId) {
    const existing = await env.DB.prepare(`
      SELECT id, public_token, recipient, title FROM stories
      WHERE owner_telegram_id=? AND client_request_id=?
    `).bind(telegramId, clientRequestId).first();
    if (existing) {
      return json({
        ok: true,
        idempotent: true,
        story: {
          id: existing.id,
          publicToken: existing.public_token,
          recipient: existing.recipient,
          title: existing.title,
          webPath: `/l/${existing.public_token}`,
          miniAppLink: cfg.botUsername ? `https://t.me/${cfg.botUsername}?startapp=letter_${existing.public_token}` : null
        },
        account: await accountSnapshot(env, telegramId)
      }, 200);
    }
  }

  const source = await consumeCredit(env, telegramId);
  if (!source) {
    return errorJson("Усі доступні листи використано", 402, {
      code: "LETTER_CREDIT_REQUIRED",
      account: await accountSnapshot(env, telegramId)
    });
  }

  const storyId = id("story");
  const publicToken = token(20);
  const now = nowMs();
  try {
    await env.DB.prepare(`
      INSERT INTO stories (id, public_token, owner_telegram_id, recipient, title, payload_json, credit_source, client_request_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      storyId, publicToken, telegramId, payload.recipient, payload.title,
      JSON.stringify(payload), source, clientRequestId, now, now
    ).run();
  } catch (error) {
    await refundCredit(env, telegramId, source);
    if (clientRequestId) {
      const existing = await env.DB.prepare(`
        SELECT id, public_token, recipient, title FROM stories
        WHERE owner_telegram_id=? AND client_request_id=?
      `).bind(telegramId, clientRequestId).first();
      if (existing) {
        return json({
          ok: true,
          idempotent: true,
          story: {
            id: existing.id,
            publicToken: existing.public_token,
            recipient: existing.recipient,
            title: existing.title,
            webPath: `/l/${existing.public_token}`,
            miniAppLink: cfg.botUsername ? `https://t.me/${cfg.botUsername}?startapp=letter_${existing.public_token}` : null
          },
          account: await accountSnapshot(env, telegramId)
        }, 200);
      }
    }
    throw error;
  }

  await qualifyReferral(env, telegramId);
  const webPath = `/l/${publicToken}`;
  const miniAppLink = cfg.botUsername ? `https://t.me/${cfg.botUsername}?startapp=letter_${publicToken}` : null;
  return json({
    ok: true,
    story: { id: storyId, publicToken, recipient: payload.recipient, title: payload.title, webPath, miniAppLink },
    account: await accountSnapshot(env, telegramId)
  }, 201);
}

async function ownedStory(env, storyId, telegramId) {
  return env.DB.prepare("SELECT * FROM stories WHERE id=? AND owner_telegram_id=?").bind(storyId, telegramId).first();
}


async function handleGetOwnedStory(env, storyId, telegramId) {
  const existing = await ownedStory(env, storyId, telegramId);
  if (!existing) return errorJson("Лист не знайдено", 404);
  const choice = await env.DB.prepare("SELECT choice_index, chosen_at FROM story_choices WHERE story_id=?").bind(storyId).first();
  return json({
    ok: true,
    story: {
      id: existing.id,
      publicToken: existing.public_token,
      recipient: existing.recipient,
      title: existing.title,
      payload: JSON.parse(existing.payload_json),
      choiceIndex: choice?.choice_index == null ? null : Number(choice.choice_index),
      chosenAt: choice?.chosen_at || null
    }
  });
}

async function handleUpdateStory(request, env, storyId, telegramId) {
  const existing = await ownedStory(env, storyId, telegramId);
  if (!existing) return errorJson("Лист не знайдено", 404);
  const choice = await env.DB.prepare("SELECT 1 FROM story_choices WHERE story_id=?").bind(storyId).first();
  if (choice) return errorJson("Отримувач уже зробив вибір. Щоб не змінювати домовленість заднім числом, цей лист більше не редагується.", 409);
  const body = await parseJson(request);
  const payload = safeStoryPayload(body.payload || body);
  const now = nowMs();
  await env.DB.prepare(`UPDATE stories SET recipient=?, title=?, payload_json=?, updated_at=? WHERE id=? AND owner_telegram_id=?`)
    .bind(payload.recipient, payload.title, JSON.stringify(payload), now, storyId, telegramId).run();
  return json({ ok: true, story: { id: storyId, publicToken: existing.public_token, payload } });
}

async function handleDeleteStory(env, storyId, telegramId) {
  const existing = await ownedStory(env, storyId, telegramId);
  if (!existing) return errorJson("Лист не знайдено", 404);
  await env.DB.prepare("DELETE FROM stories WHERE id=? AND owner_telegram_id=?").bind(storyId, telegramId).run();
  return json({ ok: true });
}

async function handlePublicStory(env, publicToken) {
  const row = await env.DB.prepare(`
    SELECT s.id, s.public_token, s.payload_json, s.created_at,
           sc.choice_index, sc.chosen_at
    FROM stories s LEFT JOIN story_choices sc ON sc.story_id=s.id
    WHERE s.public_token=?
  `).bind(publicToken).first();
  if (!row) return errorJson("Лист не знайдено", 404);
  return json({
    ok: true,
    story: {
      publicToken: row.public_token,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
      choiceIndex: row.choice_index == null ? null : Number(row.choice_index),
      chosenAt: row.chosen_at || null
    }
  });
}

async function handlePublicChoice(request, env, publicToken) {
  const row = await env.DB.prepare("SELECT id, owner_telegram_id, recipient, payload_json FROM stories WHERE public_token=?").bind(publicToken).first();
  if (!row) return errorJson("Лист не знайдено", 404);
  const body = await parseJson(request);
  const payload = JSON.parse(row.payload_json);
  const index = Number(body.choiceIndex);
  if (!Number.isInteger(index) || index < 0 || index >= (payload.choices?.length || 0)) {
    return errorJson("Некоректний вибір", 400);
  }
  const now = nowMs();
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO story_choices (story_id, choice_index, chosen_at) VALUES (?, ?, ?)
  `).bind(row.id, index, now).run();
  const choice = await env.DB.prepare("SELECT choice_index, chosen_at FROM story_choices WHERE story_id=?").bind(row.id).first();

  if ((inserted.meta?.changes || 0) > 0) {
    const selected = payload.choices[Number(choice.choice_index)];
    const who = clampText(row.recipient, 80, "Отримувач");
    const title = clampText(selected?.title, 72, "маленький план");
    const emoji = clampText(selected?.emoji, 8, "♡");
    sendBotText(
      env,
      row.owner_telegram_id,
      `💌 <b>${who} зробив(ла) вибір.</b>\n\n${emoji} ${title}\n\nВідкрий Love Letter, щоб побачити фінал.`,
      true
    ).catch(error => console.warn("Choice notification failed", error));
  }

  return json({ ok: true, choiceIndex: Number(choice.choice_index), chosenAt: choice.chosen_at });
}

async function handleCreateInvoice(env, telegramId) {
  const cfg = config(env);
  const paymentId = id("pay");
  const invoicePayload = `letter_credit:${paymentId}:${telegramId}`;
  const now = nowMs();
  await env.DB.prepare(`
    INSERT INTO payments (id, telegram_id, invoice_payload, stars, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).bind(paymentId, telegramId, invoicePayload, cfg.letterPrice, now).run();

  try {
    const invoiceUrl = await createStarsInvoiceLink(env.TELEGRAM_BOT_TOKEN, {
      title: "Додатковий лист",
      description: "1 додатковий цифровий лист Love Letter",
      payload: invoicePayload,
      stars: cfg.letterPrice
    });
    return json({ ok: true, paymentId, invoiceUrl, stars: cfg.letterPrice });
  } catch (error) {
    await env.DB.prepare("UPDATE payments SET status='failed' WHERE id=?").bind(paymentId).run();
    throw error;
  }
}

async function handlePaymentStatus(env, paymentId, telegramId) {
  const payment = await env.DB.prepare(`SELECT id, stars, status, created_at, paid_at FROM payments WHERE id=? AND telegram_id=?`)
    .bind(paymentId, telegramId).first();
  if (!payment) return errorJson("Платіж не знайдено", 404);
  return json({ ok: true, payment });
}

async function handleTermsAccept(env, telegramId) {
  await env.DB.prepare("UPDATE telegram_users SET terms_accepted_at=?, updated_at=? WHERE telegram_id=?")
    .bind(nowMs(), nowMs(), telegramId).run();
  return json({ ok: true });
}

async function sendBotText(env, chatId, text, withAppButton = false) {
  const cfg = config(env);
  const webAppUrl = cfg.botUsername && env.APP_ORIGIN ? String(env.APP_ORIGIN) : null;
  const replyMarkup = withAppButton && webAppUrl ? {
    inline_keyboard: [[{ text: "💌 Відкрити Love Letter", web_app: { url: webAppUrl } }]]
  } : undefined;
  return telegramApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });
}

async function handleWebhook(request, env) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return errorJson("Forbidden", 403);
  }
  const update = await parseJson(request);

  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const payment = await env.DB.prepare("SELECT * FROM payments WHERE invoice_payload=?")
      .bind(q.invoice_payload).first();
    const valid = payment && payment.status === "pending" &&
      String(payment.telegram_id) === String(q.from?.id) &&
      q.currency === "XTR" && Number(q.total_amount) === Number(payment.stars);
    await answerPreCheckout(env.TELEGRAM_BOT_TOKEN, q.id, Boolean(valid), valid ? undefined : "Цей платіж більше недоступний.");
    return json({ ok: true });
  }

  const message = update.message;
  if (message?.successful_payment) {
    const p = message.successful_payment;
    const payment = await env.DB.prepare("SELECT * FROM payments WHERE invoice_payload=?")
      .bind(p.invoice_payload).first();
    if (payment && payment.status === "pending" && p.currency === "XTR" && Number(p.total_amount) === Number(payment.stars)) {
      const now = nowMs();
      const updated = await env.DB.prepare(`
        UPDATE payments
        SET status='paid', telegram_payment_charge_id=?, provider_payment_charge_id=?, paid_at=?
        WHERE id=? AND status='pending'
      `).bind(p.telegram_payment_charge_id, p.provider_payment_charge_id || null, now, payment.id).run();
      if ((updated.meta?.changes || 0) > 0) {
        await env.DB.prepare("UPDATE telegram_users SET paid_credits=paid_credits+1, updated_at=? WHERE telegram_id=?")
          .bind(now, payment.telegram_id).run();
        sendBotText(
          env,
          payment.telegram_id,
          `⭐ <b>Оплату підтверджено.</b>\n\n+1 лист уже на балансі Love Letter. Дякуємо за підтримку продукту.`,
          true
        ).catch(error => console.warn("Payment confirmation failed", error));
      }
    }
    return json({ ok: true });
  }

  if (message?.text && message?.chat?.id) {
    const command = message.text.split(/\s+/)[0].toLowerCase();
    if (command === "/start") {
      await sendBotText(env, message.chat.id,
        "💌 <b>Love Letter</b>\n\nСтвори особистий цифровий лист для близької людини. Перші 3 листи щомісяця — безкоштовно.", true);
    } else if (command === "/terms") {
      await sendBotText(env, message.chat.id,
        "<b>Умови Love Letter</b>\n\nЦе сервіс створення цифрових листів. Додаткові листи оплачуються Telegram Stars. Оплата не гарантує доставку поза Telegram. Для питань щодо платежів скористайся /paysupport.");
    } else if (command === "/privacy") {
      await sendBotText(env, message.chat.id,
        "<b>Приватність Love Letter</b>\n\nМи використовуємо Telegram ID, ім’я профілю та дані, необхідні для квоти, рефералів, листів і Telegram Stars. Паролі не збираються. Публічний лист доступний лише за випадковим приватним посиланням.");
    } else if (command === "/support" || command === "/paysupport") {
      const support = env.SUPPORT_CONTACT || "@replace_support";
      await sendBotText(env, message.chat.id,
        `<b>Підтримка Love Letter</b>\n\nНапиши нам: ${support}\nДля питання про оплату додай дату та приблизний час платежу.`);
    }
    return json({ ok: true });
  }

  return json({ ok: true });
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  await ensureSchema(env);
  if (path === "/api/health") {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM stories").first().catch(() => ({ count: 0 }));
    return json({ ok: true, db: true, stories: Number(count?.count || 0), version: APP_VERSION });
  }
  if (path === "/api/telegram/webhook" && request.method === "POST") return handleWebhook(request, env);
  if (path.startsWith("/api/public/")) {
    const rest = path.slice("/api/public/".length).split("/").filter(Boolean);
    const publicToken = rest[0];
    if (!publicToken) return errorJson("Missing token", 400);
    if (rest.length === 1 && request.method === "GET") return handlePublicStory(env, publicToken);
    if (rest[1] === "choice" && request.method === "POST") return handlePublicChoice(request, env, publicToken);
    return errorJson("Not found", 404);
  }

  let auth;
  try { auth = await authenticate(request, env); }
  catch (error) {
    if (error instanceof AuthError) return errorJson(error.message, error.status);
    throw error;
  }
  const user = await ensureUser(env, auth.user, auth.startParam || null);
  const telegramId = String(user.telegram_id);

  if (path === "/api/session" && request.method === "POST") return handleSession(request, env, auth);
  if (path === "/api/account" && request.method === "GET") return json({ ok: true, ...(await accountSnapshot(env, telegramId)) });
  if (path === "/api/account/terms" && request.method === "POST") return handleTermsAccept(env, telegramId);
  if (path === "/api/stories" && request.method === "GET") return handleStoriesList(env, telegramId);
  if (path === "/api/stories" && request.method === "POST") return handleCreateStory(request, env, telegramId);
  if (path === "/api/payments/invoice" && request.method === "POST") return handleCreateInvoice(env, telegramId);
  if (path.startsWith("/api/payments/") && request.method === "GET") return handlePaymentStatus(env, path.split("/").pop(), telegramId);
  if (path.startsWith("/api/stories/")) {
    const storyId = path.split("/").pop();
    if (request.method === "GET") return handleGetOwnedStory(env, storyId, telegramId);
    if (request.method === "PATCH") return handleUpdateStory(request, env, storyId, telegramId);
    if (request.method === "DELETE") return handleDeleteStory(env, storyId, telegramId);
  }
  return errorJson("Not found", 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Love Letter worker error", error);
      return errorJson("Внутрішня помилка сервісу", 500, { code: "INTERNAL_ERROR" });
    }
  }
};
