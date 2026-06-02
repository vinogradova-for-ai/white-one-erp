<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# White One ERP — карта для агентов

Операционный кабинет бренда женской одежды White One. **Скоуп — только отдел Продукт** (фасоны → производство → платежи). Логистика/ВЭД/контент/WB/склад — read-only витрина, не работают в системе.

> ⚠️ **Это боевая система с живыми данными.** Прод = `white-one-erp.vercel.app`. Меняй поведение минимально, путь пользователя не ломай. Перед мержем — `npm test` и `npm run build` должны быть зелёными.

## Стек
- **Next.js 16.2** (App Router) · **React 19.2** · TypeScript strict
- **Prisma 6 + PostgreSQL** (локально — Docker `localhost:5432`; прод — Neon serverless)
- **Auth.js v5** (next-auth beta) · **Tailwind v4** · **react-query v5** · **react-hook-form + zod v4**
- Фото — `@vercel/blob`; Excel — `exceljs`; картинки — `sharp`

## Где что лежит
```
src/
├── app/
│   ├── (app)/…           # страницы кабинета (dashboard, orders, models, packaging, payments, gantt-v2, seasons…)
│   ├── (auth)/login      # вход
│   └── api/**/route.ts   # 47 REST-роутов (см. «Как добавить роут»)
├── components/<домен>/   # UI по доменам: orders, models, models-board (Миро), models-kanban, gantt-v2, packaging, payments, comments, common
├── lib/
│   ├── validators/       # zod-схемы входа (по одной на сущность)
│   ├── status-machine/   # переходы статусов: order / packaging / product
│   ├── calculations/     # деньги: resolve-model-cost, product-cost
│   ├── payments/         # parse-terms, generate-for-order
│   ├── queries/          # тяжёлые выборки (чек-лист дашборда, цели сезона)
│   ├── rbac.ts           # ЕДИНАЯ модель прав — can() / assertCan()
│   ├── auth.ts, auth.config.ts
│   └── prisma.ts         # singleton клиента
└── server/
    ├── api-helpers.ts    # requireAuth(), apiError() — обработка ошибок
    └── audit.ts          # logAudit()
prisma/schema.prisma      # 24 модели, источник истины по данным
```

## Инварианты (НЕ нарушать)
1. **Деньги — только `Prisma.Decimal`**, не float. Округление сумм — `.toDecimalPlaces(2)`.
2. **Снимок цен в заказе.** При создании `OrderLine` пишем `snapshotFullCost / snapshotWbPrice / snapshotCustomerPrice / …` — поздняя правка цены фасона НЕ должна менять старые заказы. Себестоимость берём ТОЛЬКО через `resolveModelCost()` (единый приоритет источников).
3. **Мягкое удаление.** Фасоны/варианты/заказы не стираем — ставим `deletedAt`. В выборках всегда `where: { deletedAt: null }`. Справочники (фабрики, упаковка) — проверка «используется» перед удалением.
4. **Доступ — через `assertCan(role, action, ownerId?, actorId?)`** из `lib/rbac.ts`, в начале каждого write-роута. Никогда не хардкодь проверки ролей в роуте — расширяй `rbac.ts`.
5. **Многошаговые записи — в `prisma.$transaction`.** Любая мутация, создающая/меняющая 2+ связанные записи (заказ+платежи+упаковка, склад±остаток), должна быть атомарной.
6. **Статусы — только через `status-machine/`.** Не выставляй статус «мимо» машины переходов; пиши `OrderStatusLog`.
7. **Аудит критичных действий — `logAudit()`** (деньги, склад, статусы, аккаунты).

## Как добавить…
- **Роут:** `src/app/api/<домен>/route.ts`. Шаблон: `requireAuth()` → `assertCan(...)` → `zodSchema.parse(await req.json())` → работа в `$transaction` при 2+ записях → `logAudit()` → `NextResponse.json(...)`. Ошибки — `try/catch` + `return apiError(e)` (сам мапит zod/Prisma/RbacError в человеческие RU-сообщения и статусы).
- **Модель:** правка `prisma/schema.prisma` → `npm run db:migrate` (создаёт миграцию) → обнови валидатор в `lib/validators/`.
- **Страницу:** `src/app/(app)/<раздел>/page.tsx`. Данные — react-query; не забывай инвалидировать кэш после мутаций.

## Сознательно удалённые сущности — НЕ воскрешать
Модели `Idea`, `Sample` и поля `margin* / roi / markupPct / hsCode` были убраны намеренно (фин-аналитика и таможня — вне скоупа отдела Продукт). Если видишь упоминание — это легаси, не восстанавливай.

## Проверка своей работы (feedback loop)
- `npm test` — юнит-тесты на чистую логику денег/дат/статусов (`src/lib/**/*.test.ts`). **Гоняй после любой правки в `lib/`.**
- `npm run build` — типы + сборка Next. Локально билд может прогонять `prisma migrate deploy`.
- ⚠️ **Preview-билд на Vercel стабильно падает — это известно, прод при этом работает.** Не считай красный preview блокером, но и не маскируй им реальные ошибки.

## Гитфлоу
Ветка под задачу → коммит (conventional: `feat(scope): …`, `fix(scope): …`) → PR → `gh pr merge --squash --admin` → Vercel автодеплоит `main`. Прод не правится напрямую.

## Гочи
- **4 env-файла** (`.env`, `.env.local`, `.env.development.local`, `.env.example`) — легко рассинхронить. Истина для локали — `.env` (Docker Postgres).
- God-файлы (`gantt-v2-chart.tsx`, `models-board/board-canvas.tsx`) >1000 строк — читай прицельно, не целиком.
- Подробный журнал решений — `HANDOFF.md` (большой; ищи по разделам, не читай целиком).
