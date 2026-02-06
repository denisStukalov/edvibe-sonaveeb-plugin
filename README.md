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

## Если слово не определяется

В `src/content.js` обновите селекторы `TRAINING_BLOCK_SELECTOR`, `TRAINING_CARD_SELECTOR`, `ACTIVE_WORD_SELECTOR` под текущую верстку Edvibe.
