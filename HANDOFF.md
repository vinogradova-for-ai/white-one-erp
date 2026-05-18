# Handoff — White One ERP

> Передача дел новому чату. Последняя сессия: **17–18 мая 2026**. Большой пак UX-правок по Ганту, переезжаем.

## 📍 Где мы сейчас

- **Ветка**: `main` (всё что сделано — уже на проде)
- **Прод**: https://white-one-erp.vercel.app (Vercel автодеплой с push в main)
- **Логин Алёны**: `alena@whiteone.ru` / `whiteone2026`
- **Команда**: 11 человек, Алёна (OWNER), Даша (DIRECTOR), Вера+Оля (PM, Оля в Гуанчжоу), Настя (ASSISTANT-склад), Катя (CONTENT), Таня (LOGISTICS), Элина (CUSTOMS), Вика+Лиза (WB)

## ✅ Что выкатили в эту сессию (PR'ы 35–51)

### /gantt-v2 — главный фронт работ

| PR | Что |
|---|---|
| [#35](https://github.com/vinogradova-for-ai/white-one-erp/pull/35) | Сплошная заливка плашек, убраны диагональные штрихи |
| [#36](https://github.com/vinogradova-for-ai/white-one-erp/pull/36) | Чистая шапка: только фильтры Категория+Ответственный, зум 1н/1м/3м. Плотность=normal по умолчанию (без переключателя). Сортировка по запуску ASC. Группировка убрана. Удалён wheel-хайджак (вертикальный скролл больше не превращается в горизонтальный) |
| [#39](https://github.com/vinogradova-for-ai/white-one-erp/pull/39) | Поле занимает h-[calc(100vh-200px)] — полная высота. Тултипы больше не накладываются (убран нативный `title`, остался только кастомный dark) |
| [#40](https://github.com/vinogradova-for-ai/white-one-erp/pull/40) | Палитра фаз: Разработка=slate-400, Производство=blue-500, ОТК=amber-500, **Доставка=emerald-500** (вместо fuchsia). Малиновый/розовый убраны целиком |
| [#44](https://github.com/vinogradova-for-ai/white-one-erp/pull/44) | Из тултипов убраны надписи «СКОРО ДЕДЛАЙН»/«ПРОСРОЧЕНО» — дубль с цветом обводки |
| [#45](https://github.com/vinogradova-for-ai/white-one-erp/pull/45) | Сортировка по дедлайну производства (end фазы Производство ASC), не по launchMonth |
| [#46](https://github.com/vinogradova-for-ai/white-one-erp/pull/46) | Убраны галочки ✓ на done-плашках |
| [#47](https://github.com/vinogradova-for-ai/white-one-erp/pull/47) | Убраны иконки 🔥/⚠️/↯даты из строк и легенда из шапки |
| [#48](https://github.com/vinogradova-for-ai/white-one-erp/pull/48) | Drag-resize левой колонки «Заказ/Фасон» (140–700px), сохранение в localStorage `gantt-v2:leftColWidth` |
| [#49](https://github.com/vinogradova-for-ai/white-one-erp/pull/49) | **Автосейв drag-изменений** через дебаунс 600мс с тостом «Сохранено» через sonner. Sticky save-bar убран целиком |
| [#50](https://github.com/vinogradova-for-ai/white-one-erp/pull/50) | Обводки только на активной фазе (отменено в #51) |
| [#51](https://github.com/vinogradova-for-ai/white-one-erp/pull/51) | **Все ring-обводки убраны** (red/amber). + todayIso по МСК (UTC+3) — иначе ночью 0–3 МСК «сегодня» уезжало на день назад |

### /gantt (старый)

| PR | Что |
|---|---|
| [#38](https://github.com/vinogradova-for-ai/white-one-erp/pull/38) | Убраны фантомные «Разработки» (done-фаза без обеих дат не рендерится). Заказы со статусом WAREHOUSE_MSK/PACKING/SHIPPED_WB помечены `archived` → уходят в конец списка, рендерятся с opacity-45 |
| [#51](https://github.com/vinogradova-for-ai/white-one-erp/pull/51) | todayIso по МСК (тот же фикс что и в gantt-v2) |

### /orders

| PR | Что |
|---|---|
| [#37](https://github.com/vinogradova-for-ai/white-one-erp/pull/37) | Добавлена строка пилюль «Ответственный» (Все/Алёна/Вера/Катя/Настя/Оля). Сортировка по launchMonth ASC, createdAt ASC (вместо updatedAt DESC) |

### Инфра

| PR | Что |
|---|---|
| [#29, #41, #42, #43](https://github.com/vinogradova-for-ai/white-one-erp/pulls) | Retry-deploys из-за Neon P1002 advisory lock. Известный transient timeout |

## 🎨 Текущая палитра фаз

- **Разработка** — `bg-slate-400` (серый, нейтральный)
- **Производство** — `bg-blue-500` (синий)
- **ОТК** — `bg-amber-500` (янтарный)
- **Доставка** — `bg-emerald-500` (зелёный)
- done-фаза → `opacity-50`
- активная и future → полный цвет
- **обводок нет** (ни на просроченных, ни на nearly-due)

## 🎯 Контракт жестов в Ганте (важно — Алёна явно сформулировала)

| Жест | Что меняется в БД |
|---|---|
| **◀ самой первой плашки** | startField (decisionDate) — все фазы сдвигаются на дельту |
| **▶ любой плашки** | endField этой фазы — соседи СПРАВА едут с сохранением длительностей |
| **◀ не первой плашки** | endField предыдущей фазы (= то же поле что её start) |

**Drag только за края (◀ ▶), не за середину.** Никаких clamp'ов.

## 💾 Автосейв (новое в этой сессии)

В `gantt-v2-client.tsx`:
- `handleBarChange` → буферит изменение + сбрасывает debounce-таймер на 600мс
- По таймеру `flushAutosave()` → батчит изменения по orderId → PATCH `/api/orders/[id]` или `/api/packaging-orders/[id]`
- Успех → `toast.success("Сохранено")` через sonner, `router.refresh()`
- Ошибка → `toast.error(...)`
- Sticky save-bar **удалён** — никакой кнопки «Сохранить», всё автоматом

## 📂 Где живёт логика Ганта v2

- `src/app/(app)/gantt-v2/page.tsx` — серверный data-fetcher. Генерирует `GanttRowV2[]` для заказов (4 фазы) и упаковки (3 фазы). `moscowToday()` для todayIso
- `src/components/gantt-v2/gantt-v2-client.tsx` — клиентский wrapper. Фильтрация, сортировка по дедлайну производства, автосейв
- `src/components/gantt-v2/gantt-v2-chart.tsx` — основной чарт, шкала, RowView, DraggableBar. Resize-handle левой колонки (`ResizeHandle`)
- `src/components/gantt-v2/types.ts` — типы

## 🔮 Что НЕ сделано — отдельный заход (большие фичи)

Эти два пункта были в исходном пакете правок 17.05, но это новые сущности с миграциями БД и формами CRUD — отложены до обсуждения модели данных:

### 1. Вкладка «Поступление»
Новая сущность (Receipt?), отдельная от Order:
- Список с датой поступления на склад, факт vs план по количеству
- Гант проверки и упаковки
- При создании — позиции автоматом из заказа, склад/ВЭД вписывают факт-количество
- **Открытый вопрос**: один заказ = много партий или одно поступление?

### 2. Автосчёт «тетрадка»
Таблица «цвет × размер × количество» по дням/доставкам с автосуммированием:
- **Открытый вопрос**: это часть Поступления (приёмка факт-количеств по цвет/размер)? Или отдельная сводная по нескольким заказам?

Алёна прикладывала фото тетради со столбцами «цвет / размер / количество» по дням — нужно автосчётно.

## ⚙️ Правила (memory + рабочие)

1. **Никаких `.default()`** в Zod-схемах с `.partial()` для PATCH — обнуляют поля
2. **Не пересоздавать БД** без явного консента (он действует — фейковые данные)
3. **Простой язык** для Алёны: «форма / справочник / карточка / ссылка», не «API / JWT / миграция»
4. **Короткие отчёты** после правок: «Готово. Обнови страницу. Теперь работает X.»
5. **Не переспрашивать про работу и деплой** — задача взяла → делаю → коммит → PR через `gh pr merge --squash --admin`. Push на main напрямую заблокирован политикой
6. **Никакой `git push --force` на main**
7. **Drag за края, не за середину** — главный UX-закон Гант'а
8. **Стиль Алёны**: скрин + короткая фраза → AI догадывается → чинит

## 🛠 Запуск локально

```bash
cd ~/projects/white-one
brew services start postgresql@16
npm run dev   # http://localhost:3000
```

## 📚 Доп ссылки

- `CONTEXT_FOR_NEW_SESSION.md` — большой контекст про продукт/архитектуру/статусы
- Memory: `~/.claude/projects/-Users-alenaleonteva-SecondBrain/memory/MEMORY.md`
- Vercel project: `white-one-erp` (org `vinogradova-for-ais-projects`)

## ⚠️ Известные особенности

- **Vercel preview-build** для PR'ов падает (ESLint? env?), prod build с main работает. Не блокирует мерж
- **Neon P1002** — periodic advisory lock timeout. Решается ретрай-PR'ом с пустым коммитом
- **localStorage `gantt-v2:leftColWidth`** — ширина левой колонки сохраняется на устройство пользователя

---

_Файл обновляется при передаче в новый чат. Актуально на 2026-05-18._
