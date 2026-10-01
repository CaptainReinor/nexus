# NEXUS для Android

Сохраняйте соседнюю папку `NEXUS`: клиент импортирует из неё общие схемы, расчёты и компоненты.

Нужны Node.js 24, JDK 21 и Android SDK. Выполните `npm ci`, `npm ci --prefix ../NEXUS --ignore-scripts` и `npm run android:apk`. APK появится в `android/app/build/outputs/apk/debug/`.

Секреты, `android/local.properties` и ключи подписи не добавляйте в Git. При первом запуске укажите адрес своего HTTPS-сервера и свой код доступа. Подробности — в [главном README](../README.md).
