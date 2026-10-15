# Изображения для README

Эта папка включается в Git намеренно. Остальные содержимые `artifacts/`, отчёты и trace-файлы тестов исключены.

- `hero.png` — иллюстративная обложка, созданная встроенным инструментом `image_gen` 15 октября 2026 года. Не фотография ассортимента и не снимок интерфейса.
- `storefront.png`, `mobile-light.png`, `mobile-dark.png`, `services.png` — реальные снимки витрины с демонстрационными товарами.
- `admin.png`, `security.png`, `messages.png` — реальные снимки изолированной демонстрационной админ-панели. Заказы отсутствуют, поля паролей пустые, в предпросмотре — вымышленные данные.

Снимки получены в Chrome через Playwright на временной базе. Они подготовлены для публикации; рабочие данные, секреты и результаты тестовых запусков здесь не сохраняются. Изображения Hafiz не копировались.

## Промпт обложки

Использован встроенный `image_gen`, без внешнего CLI и без API-ключа пользователя.

> Create a premium wide 16:9 GitHub README hero cover for a real Russian-language e-commerce project named «КИП и А». Editorial industrial product presentation, calm precision. Warm off-white left half with huge perfectly legible Cyrillic title «КИП и А», smaller subtitle «Электротехника. Под контролем.» and a subtle short line «Каталог · Услуги · Управление». Right half deep slate navy #203751 with elegant photorealistic unbranded modular circuit breakers, a neatly assembled electrical panel and a small black copper-core cable coil floating on restrained platforms. Thin engineering grid, precise soft shadows, muted sage green #41816d and terracotta #ca543b accents. Professional minimal composition with generous negative space; polished 3D studio lighting, no people, no third party logos, no fake dashboards, no charts, no small text, no watermarks. This is an illustrative product cover, not a UI screenshot. Crisp 1536x864 or similar landscape aspect ratio.
