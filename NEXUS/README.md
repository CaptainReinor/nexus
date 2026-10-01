# NEXUS для Windows

Актуальные инструкции и установщики описаны в [главном README](../README.md). Общие модели и промпты лежат в `src/shared` и используются Android-клиентом из соседней папки.

Разработка: `npm ci`, `npm ci --prefix ../NEXUS-Android --ignore-scripts`, `npm run dev`. Проверка: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Установщик: `npm run dist:win`.
