# Edvibe Sonaveeb Link (Chrome extension)

Минимальное расширение, которое на `edvibe.com` показывает кнопку-ссылку на словарь Sonaveeb для текущего слова.

## Установка

1. Откройте `chrome://extensions`.
2. Включите `Developer mode`.
3. Нажмите `Load unpacked`.
4. Выберите папку проекта `edvibe-plugin`.

## Как это работает

- Скрипт запускается на страницах `https://edvibe.com/*`.
- Отслеживает карточку тренировки и текущее слово из `.form-training-view-word .form-training-word-card_inner_scroll_text`.
- Кнопка открывает `sonaveeb.ee` для найденного слова.
- Запрашивает первые 3 формы слова из `https://api.sonapi.ee/v2/<word>` и показывает их рядом с кнопкой.
- Автоозвучка карточек блокируется, ручной клик по иконке динамика остается доступным.

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

В `src/content.js` обновите селекторы `TRAINING_BLOCK_SELECTORS`, `TRAINING_CARD_SELECTORS`, `ACTIVE_WORD_SELECTORS` под текущую верстку Edvibe.

## Публикация в Chrome Web Store

- Политика приватности: `PRIVACY_POLICY.md`
- Чеклист подачи: `STORE_SUBMISSION.md`
- Упаковка архива для загрузки:

```bash
./scripts/package-store.sh
```
