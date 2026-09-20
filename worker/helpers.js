export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

export function errorJson(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}

export function id(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function token(length = 18) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map(b => (b % 36).toString(36)).join("");
}

export function nowMs() {
  return Date.now();
}

export function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function nextMonthIso(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0)).toISOString();
}

export function clampText(value, max, fallback = "") {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, max);
}

export function safeStoryPayload(input = {}) {
  const choicesRaw = Array.isArray(input.choices) ? input.choices.slice(0, 4) : [];
  const choices = choicesRaw.map((choice, index) => ({
    emoji: clampText(choice?.emoji, 8, ["☕", "🌿", "💭", "♡"][index] || "♡"),
    title: clampText(choice?.title, 72, "Наш маленький план"),
    subtitle: clampText(choice?.subtitle, 120, "")
  }));
  while (choices.length < 4) {
    const defaults = [
      { emoji: "☕", title: "Випити кави", subtitle: "" },
      { emoji: "🌿", title: "Прогулятися", subtitle: "" },
      { emoji: "💭", title: "Поговорити", subtitle: "" },
      { emoji: "♡", title: "Обійнятися", subtitle: "" }
    ];
    choices.push(defaults[choices.length]);
  }

  return {
    recipient: clampText(input.recipient, 80, "Для тебе"),
    salutation: clampText(input.salutation, 100, "це тобі"),
    title: clampText(input.title, 120, "Кілька слів для тебе"),
    message: clampText(input.message, 5000, "Я просто хотів залишити тут трохи тепла для тебе."),
    signature: clampText(input.signature, 100, "З ніжністю"),
    font: ["classic", "romantic", "modern", "handwritten"].includes(input.font) ? input.font : "classic",
    occasion: clampText(input.occasion, 40, "just-because"),
    choiceTitle: clampText(input.choiceTitle, 100, "Що будемо робити?"),
    choices,
    finalTitle: clampText(input.finalTitle, 100, "Домовились"),
    finalNote: clampText(input.finalNote, 240, "Нехай цей момент запам’ятається хорошим."),
    finalDate: clampText(input.finalDate, 40, ""),
    finalTime: clampText(input.finalTime, 20, "")
  };
}
