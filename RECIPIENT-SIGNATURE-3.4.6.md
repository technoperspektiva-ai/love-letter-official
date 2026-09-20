# Love Letter 3.4.6 — recipient signature

Public recipient pages (`/l/...`) now show a subtle branded signature under the letter experience:

- “Надіслано з любов’ю через Love Letter”
- a lightweight “Створити свій лист” link
- the CTA opens `@loveletter_official_bot` with `start=share`
- signature is recipient-only and does not appear in the creator/editor UI
- responsive styling for mobile Safari, Chrome, and Telegram WebView

All 3.4.5 behavior remains: existing authenticated web sessions survive `/weboff`, and owner commands `/free` + `/setfree` use the global D1 free-letter setting.
