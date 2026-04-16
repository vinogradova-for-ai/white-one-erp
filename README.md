# White One ERP

Система управления продуктовым циклом White One — от идеи изделия до продажи на Wildberries.

## Стек

- **Next.js 16** (App Router) + TypeScript
- **PostgreSQL 16** + **Prisma 6**
- **Auth.js v5** (credentials, JWT-сессии)
- **Tailwind CSS 4** + кастомные компоненты (без shadcn init)
- **TanStack Query + Table**, react-hook-form + zod
- **exceljs** (импорт/экспорт)

## Быстрый старт (локально)

### Требования
- Node.js 20+
- PostgreSQL 16 (Homebrew: `brew install postgresql@16`)

### Шаги

```bash
# 1. Установить зависимости
npm install

# 2. Запустить Postgres
brew services start postgresql@16

# 3. Создать БД
psql -d postgres -c "CREATE USER whiteone WITH PASSWORD 'whiteone_dev_pass' CREATEDB;"
psql -d postgres -c "CREATE DATABASE whiteone OWNER whiteone;"

# 4. Применить миграции
npm run db:migrate

# 5. Заполнить демо-данными
npm run db:seed

# 6. Запустить dev-сервер
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

### Тестовые логины

Все пароли: `whiteone2026`

| Email | Имя | Роль |
|---|---|---|
| `alena@whiteone.ru` | Алёна | Собственник |
| `dasha@whiteone.ru` | Даша | Руководитель |
| `vera@whiteone.ru` | Вера | Продукт-менеджер |
| `olya.pm@whiteone.ru` | Оля (Гуанчжоу) | Продукт-менеджер |
| `nastya@whiteone.ru` | Настя | Ассистент (упаковка) |
| `katya@whiteone.ru` | Катя | Контент-менеджер |
| `tanya@whiteone.ru` | Таня | Логист |
| `elina@whiteone.ru` | Элина | ВЭД |
| `vika@whiteone.ru` | Вика | WB-менеджер |
| `liza@whiteone.ru` | Лиза | WB-менеджер |
| `intern.katya@whiteone.ru` | Катя (стажёр) | Стажёр |

## Скрипты

```bash
npm run dev          # Dev-сервер (Turbopack)
npm run build        # Продакшн-сборка
npm run start        # Запуск продакшн
npm run lint

npm run db:migrate   # Создать и применить миграцию
npm run db:seed      # Заполнить БД демо-данными
npm run db:reset     # Сбросить БД + re-seed
npm run db:studio    # Prisma Studio — GUI к БД
```

## Готово в MVP

- ✅ Аутентификация с ролями (11 пользователей)
- ✅ Каталог изделий — список, карточка, форма создания, смена статуса
- ✅ Заказы на производство — список, карточка, форма, смена статуса
- ✅ Машина статусов (жёсткая последовательность, откат только OWNER/DIRECTOR)
- ✅ Автоматический расчёт себестоимости, маржи, ROI (формулы учитывают CNY+RUB+курс+буфер)
- ✅ Вид «Мои задачи» с ближайшими дедлайнами
- ✅ Дашборд с KPI
- ✅ План / Факт по месяцам
- ✅ Хиты для масштабирования
- ✅ Календарь поставок, очередь упаковки, платёжный календарь
- ✅ Загрузка фабрик (матрица фабрика × месяц)
- ✅ Воронка новинок (канбан по статусам разработки)
- ✅ Админ — пользователи
- ✅ Адаптивная вёрстка (bottom-nav на мобильных)
- ✅ Русская локаль, форматы ₽ / dd.mm.yyyy

## Не готово (следующие итерации)

- Импорт Excel (веб-интерфейс и CLI) — Фаза 2
- Telegram-бот — Фаза 4
- Экспорт Excel
- Unit-тесты и Playwright
- Редактирование профиля, создание пользователей
- Детализация прав (сейчас упрощённая матрица)
- Docker образ для продакшн-деплоя

## Архитектура

См. план: `/Users/alenaleonteva/.claude/plans/lexical-forging-pearl.md`

### Расчётные формулы

- `fullCost = CNY × rate × (1 + 5% буфер) + упаковка + логистика WB`
- или если задана цена в рублях: `fullCost = RUB + упаковка + логистика`
- `marginBeforeDrr = customerPrice × redemption% − fullCost − wbPrice × commission%`
- `ROI = marginAfterDrr / fullCost`

Буфер (5%) настраивается через `COST_BUFFER_PCT` в `.env`.

## Деплой

Рекомендуется Selectel + managed PostgreSQL. Docker-образ добавим в Фазе 4.
