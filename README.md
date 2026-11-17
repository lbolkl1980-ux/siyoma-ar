# SIYOMA · «Оживающий сертификат» (дополненная реальность)

Человек сканирует QR-код на бланке → открывается страница → наводит камеру на сертификат →
из бумаги выходит дракон FIRE ENERGY DRAGON, дышит огнём, вокруг листа бьют молнии, надпись «ПОЗДРАВЛЯЕМ!».
Работает в браузере телефона (iPhone и Android), приложение не нужно.

- Сайт — папка `public/` (публикуется на GitHub Pages, ветка `gh-pages`).
- Какие бланки узнаёт камера — `targets/` (картинки) → `public/targets.mind`.
- Кнопки после анимации (Instagram, фото, промокод) — массив `LINKS` в начале `public/app.js`.

## Обновить
```bash
# поменялись бланки → положить новые картинки в targets/ и пересобрать
node tools/compile.js
# проверка без телефона (виртуальная камера)
node tools/make-fake-camera.js targets/v7-energy-white-a.jpg && node tools/test.js
# локально
node tools/serve.js   # http://localhost:8090/public/
```
Дракон сейчас вырезан из фото банки (`public/assets/dragon.png`) — заменить на вектор от дизайнера.
