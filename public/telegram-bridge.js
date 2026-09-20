export const tg = window.Telegram?.WebApp || null;

export function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (tg.isVersionAtLeast?.("8.0")) tg.requestFullscreen?.();
    tg.setHeaderColor?.("#fff8f2");
    tg.setBackgroundColor?.("#fff8f2");
    tg.setBottomBarColor?.("#fff8f2");
    tg.enableClosingConfirmation?.();
  } catch {}
}

export function initData() {
  return tg?.initData || "";
}

export function startParam() {
  return tg?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get("tgWebAppStartParam") || "";
}

export function haptic(type = "light") {
  try {
    if (type === "success" || type === "error" || type === "warning") tg?.HapticFeedback?.notificationOccurred(type);
    else tg?.HapticFeedback?.impactOccurred(type);
  } catch {}
}

export function openInvoice(url) {
  return new Promise(resolve => {
    if (tg?.openInvoice) {
      tg.openInvoice(url, status => resolve(status || "closed"));
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    resolve("opened");
  });
}

export function openTelegram(url) {
  try {
    if (tg?.openTelegramLink) return tg.openTelegramLink(url);
  } catch {}
  location.href = url;
}

export function backButton(show, handler) {
  if (!tg?.BackButton) return;
  try {
    tg.BackButton.offClick?.(window.__llBackHandler || (()=>{}));
    if (show && handler) {
      window.__llBackHandler = handler;
      tg.BackButton.onClick(handler);
      tg.BackButton.show();
    } else {
      tg.BackButton.hide();
    }
  } catch {}
}

export function shareLink(url, text = "") {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  openTelegram(share);
}
