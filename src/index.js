const TELEGRAM_API = "https://api.telegram.org";
const OPENAI_API = "https://api.openai.com/v1/responses";

const MODELS = {
  "gpt-5.6": {
    id: "gpt-5.6",
    title: "GPT-5.6"
  },
  "gpt-6-astra": {
    id: "gpt-6-astra",
    title: "GPT-6 Astra"
  }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        name: "great-jarvis",
        telegram: "@greatjarvis_bot",
        default_model: env.DEFAULT_MODEL || "gpt-5.6",
        model_storage: env.USER_PREFS ? "cloudflare-kv" : "default-only"
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("OK");
    }

    if (request.method !== "POST" || url.pathname !== "/telegram") {
      return new Response("Not found", { status: 404 });
    }

    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    ctx.waitUntil(handleUpdate(update, env));
    return new Response("OK");
  }
};

async function handleUpdate(update, env) {
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
    return;
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  const text = message?.text?.trim();

  if (!chatId || !userId || !text) return;

  if (text === "/start") {
    const model = await getUserModel(env, userId);

    await sendMessage(env, chatId,
      `Привет 👋\n\nЯ Great Jarvis.\nСейчас выбрана модель: ${MODELS[model]?.title || model}\n\nПросто напиши сообщение.\n/model — выбрать модель`
    );
    return;
  }

  if (text === "/help") {
    await sendMessage(env, chatId,
      "Команды:\n/model — выбрать GPT-модель\n/current — показать текущую модель\n/help — помощь\n\nОстальной текст отправляется в GPT."
    );
    return;
  }

  if (text === "/model") {
    await sendModelKeyboard(env, chatId, userId);
    return;
  }

  if (text === "/current") {
    const model = await getUserModel(env, userId);
    await sendMessage(env, chatId, `Текущая модель: ${MODELS[model]?.title || model}`);
    return;
  }

  try {
    const model = await getUserModel(env, userId);
    await sendChatAction(env, chatId, "typing");
    const answer = await askOpenAI(env, model, text);
    await sendLongMessage(env, chatId, answer);
  } catch (error) {
    console.error("HANDLE_MESSAGE_ERROR", error);
    await sendMessage(
      env,
      chatId,
      "Не удалось получить ответ. Проверь OpenAI API key, доступ к выбранной модели и баланс API."
    );
  }
}

async function handleCallback(callback, env) {
  const callbackId = callback.id;
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  const userId = callback.from?.id;
  const data = callback.data;

  if (!callbackId || !userId) return;

  if (!data?.startsWith("model:")) {
    await answerCallback(env, callbackId, "Неизвестное действие");
    return;
  }

  const model = data.slice("model:".length);

  if (!MODELS[model]) {
    await answerCallback(env, callbackId, "Неизвестная модель");
    return;
  }

  if (!env.USER_PREFS) {
    await answerCallback(
      env,
      callbackId,
      "KV ещё не подключён — включи USER_PREFS в wrangler.toml",
      true
    );
    return;
  }

  await env.USER_PREFS.put(`model:${userId}`, model);
  await answerCallback(env, callbackId, `Выбрано: ${MODELS[model].title}`);

  if (chatId && messageId) {
    await editMessage(env, chatId, messageId,
      `Модель выбрана: ${MODELS[model].title}`,
      {
        inline_keyboard: [
          [
            button(model === "gpt-5.6" ? "✅ GPT-5.6" : "GPT-5.6", "model:gpt-5.6"),
            button(model === "gpt-6-astra" ? "✅ GPT-6 Astra" : "GPT-6 Astra", "model:gpt-6-astra")
          ]
        ]
      }
    );
  }
}

async function sendModelKeyboard(env, chatId, userId) {
  const current = await getUserModel(env, userId);

  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text: `Выбери модель.\nТекущая: ${MODELS[current]?.title || current}`,
    reply_markup: {
      inline_keyboard: [
        [
          button(current === "gpt-5.6" ? "✅ GPT-5.6" : "GPT-5.6", "model:gpt-5.6"),
          button(current === "gpt-6-astra" ? "✅ GPT-6 Astra" : "GPT-6 Astra", "model:gpt-6-astra")
        ]
      ]
    }
  });
}

async function getUserModel(env, userId) {
  const fallback = MODELS[env.DEFAULT_MODEL] ? env.DEFAULT_MODEL : "gpt-5.6";

  if (!env.USER_PREFS) return fallback;

  const stored = await env.USER_PREFS.get(`model:${userId}`);
  return MODELS[stored] ? stored : fallback;
}

async function askOpenAI(env, model, input) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");

  const response = await fetch(OPENAI_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions: env.SYSTEM_PROMPT || "Ты полезный ассистент в Telegram.",
      input
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("OPENAI_ERROR", response.status, data);
    throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
  }

  return extractText(data) || "GPT вернул пустой текстовый ответ.";
}

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = [];
  for (const item of data?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function button(text, callback_data) {
  return { text, callback_data };
}

async function telegram(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is missing");

  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (!response.ok || !data?.ok) {
    console.error("TELEGRAM_ERROR", method, response.status, data);
    throw new Error(data?.description || `Telegram ${method} failed`);
  }

  return data.result;
}

async function sendMessage(env, chatId, text) {
  return telegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

async function editMessage(env, chatId, messageId, text, replyMarkup) {
  return telegram(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: replyMarkup
  });
}

async function answerCallback(env, callbackQueryId, text, showAlert = false) {
  return telegram(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert
  });
}

async function sendChatAction(env, chatId, action) {
  return telegram(env, "sendChatAction", {
    chat_id: chatId,
    action
  });
}

async function sendLongMessage(env, chatId, text) {
  const limit = 3900;
  for (let i = 0; i < text.length; i += limit) {
    await sendMessage(env, chatId, text.slice(i, i + limit));
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
