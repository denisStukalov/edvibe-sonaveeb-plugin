# Edvibe Sonaveeb Link (Chrome extension)

Расширение для `edvibe.com`, которое добавляет ссылку на Sõnaveeb для текущего слова и показывает 3 формы из Sonapi.

## Установка

1. Откройте `chrome://extensions`.
2. Включите `Developer mode`.
3. Нажмите `Load unpacked`.
4. Выберите папку проекта `edvibe-plugin`.

## Как это работает

- Скрипт запускается на страницах `https://edvibe.com/*`.
- Работает в тренировках на страницах:
  - `https://edvibe.com/cabinet/student/words/to-learn`
  - `https://edvibe.com/cabinet/student/words/learned`
- Отслеживает текущую карточку и слово, показывает кнопку:
  - `Открыть в Sõnaveeb: <word>`
- Кнопка открывает `https://sonaveeb.ee` для найденного слова.
- Запрашивает формы из `https://api.sonapi.ee/v2/<word>` и показывает 3 формы рядом с кнопкой.
  - Для глаголов используются: базовая форма, `Inf`, `IndPrSg1` (с запасным `SupIps`).
- Автоозвучка карточек можно отключать в настройках расширения (по умолчанию выключена).

## Настройки

Откройте страницу настроек расширения (`Details` → `Extension options`):
- Положение блока: сверху, снизу или справа от карточки.
- Отключение автоозвучки карточек (по умолчанию включено).

Значения по умолчанию:
- Положение блока: сверху по центру (`top`).
- Автоозвучка: отключается расширением (`disableAutoplay = true`).

Чтобы проверить сразу:
1. Откройте `chrome://extensions`.
2. У расширения нажмите `Details`.
3. Откройте `Extension options` и измените параметры.
4. Обновите страницу Edvibe.

## Если слово не определяется

В `src/content.js` при необходимости обновите селекторы:
- `TRAINING_BLOCK_SELECTORS`
- `TRAINING_CARD_SELECTORS`
- `ACTIVE_WORD_SELECTORS`

## Публикация в Chrome Web Store

- Политика приватности: `PRIVACY_POLICY.md`
- Чеклист подачи: `STORE_SUBMISSION.md`
- Упаковка архива для загрузки:

```bash
./scripts/package-store.sh
```
