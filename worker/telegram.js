const encoder = new TextEncoder();

export class AuthError extends Error {
  constructor(message = "Unauthorized", status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) throw new AuthError("Telegram authorization is missing");

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new AuthError("Telegram hash is missing");

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  // Telegram: secret_key = HMAC_SHA256(bot_token, key="WebAppData")
  const secretKey = await hmacSha256(encoder.encode("WebAppData"), botToken);
  const expected = bytesToHex(await hmacSha256(secretKey, dataCheckString));

  if (!timingSafeEqualHex(expected, hash.toLowerCase())) {
    throw new AuthError("Invalid Telegram signature");
  }

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0) throw new AuthError("Invalid Telegram auth date");
  if (maxAgeSeconds > 0 && Math.abs(now - authDate) > maxAgeSeconds) {
    throw new AuthError("Telegram session has expired");
  }

  let user = null;
  try {
    const raw = params.get("user");
    user = raw ? JSON.parse(raw) : null;
  } catch {
    throw new AuthError("Invalid Telegram user payload");
  }
  if (!user?.id) throw new AuthError("Telegram user is missing");

  return {
    user,
    authDate,
    queryId: params.get("query_id") || null,
    startParam: params.get("start_param") || null,
    raw: Object.fromEntries(params.entries())
  };
}

export async function telegramApi(botToken, method, payload = {}) {
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram API ${method} failed (${response.status})`);
  }
  return data.result;
}

export async function createStarsInvoiceLink(botToken, { title, description, payload, stars }) {
  return telegramApi(botToken, "createInvoiceLink", {
    title,
    description,
    payload,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: title, amount: stars }]
  });
}

export async function answerPreCheckout(botToken, id, ok, errorMessage) {
  return telegramApi(botToken, "answerPreCheckoutQuery", {
    pre_checkout_query_id: id,
    ok,
    ...(ok ? {} : { error_message: errorMessage || "Не вдалося підтвердити оплату." })
  });
}
