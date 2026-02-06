# Edvibe Sonaveeb Link (Chrome extension)

Минимальное расширение, которое на `edvibe.com` показывает кнопку-ссылку на словарь Sonaveeb для текущего слова.

## Установка

1. Откройте `chrome://extensions`.
2. Включите `Developer mode`.
3. Нажмите `Load unpacked`.
4. Выберите папку проекта `edvibe-plugin`.

## Как это работает

- Скрипт запускается на страницах `https://edvibe.com/*`.
- Он отслеживает изменения DOM и пытается найти текущее слово по набору селекторов в `src/content.js` (`WORD_SELECTORS`).
- Плавающая кнопка в правом нижнем углу открывает `sonaveeb.ee` для найденного слова.

## Если слово не определяется

В `src/content.js` обновите список `WORD_SELECTORS` под реальные CSS-классы страницы Edvibe.
