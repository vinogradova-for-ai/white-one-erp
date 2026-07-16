"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import { CommentsDrawer } from "./comments-drawer";
import { usePersistedState } from "@/lib/use-persisted-state";
import { isLightColor } from "@/lib/color-map";

// Колонки разработки — бросок фасона сюда меняет стадию фасона (PATCH kanban-stage).
const DEV_TARGETS = new Set(["idea", "sample", "ideal_sample", "sizing_done"]);

// Пост-заказные колонки: бросок фасона сюда создаёт заказ СРАЗУ на этом этапе —
// форма создания открывается с предвыбранным этапом (= этой колонкой).
// Статусы соответствуют ORDER_CREATE_STAGES из lib/order-stage.
const ORDER_CREATE_TARGETS: Record<string, { status: string; label: string }> = {
  production: { status: "SEWING", label: "Производство" },
  qc: { status: "QC", label: "ОТК" },
  delivery: { status: "IN_TRANSIT", label: "Доставка" },
  done: { status: "WAREHOUSE_MSK", label: "Завершено" },
};

export type KanbanCard = {
  modelId: string;
  modelName: string;
  brandLabel: string;
  category: string;
  subcategory: string | null;
  photo: string | null;
  palette: [string, string];
  factoryName: string | null;
  // Поля для клиентской фильтрации (KanbanFiltersClient).
  // Не используются в самом рендере карточки.
  ownerId?: string | null;
  columnKey?: string;
  qty: number;
  orderNumber: string | null;
  orderId: string | null;
  /** Точный статус заказа («ОТК», «Готов к отгрузке») — колонка «ОТК» вмещает
   *  два статуса, без бейджа не видно, какой именно (пример Алёны 04.07). */
  orderStatusLabel?: string | null;
  deadline: { iso: string; label: string } | null;
  dlColor: "red" | "amber" | "gray" | null;
  colorChips: Array<{ name: string; hex: string }>;
  /** Все фото фасона — для карусели в карточке. */
  photos?: string[];
  /** Кол-во комментов к фасону + превью 2 последних. */
  commentCount?: number;
  lastComments?: Array<{ author: string; snippet: string; photos: number }>;
  /** Тип карточки: фасон (модель + опц. заказ) или заказ упаковки целиком.
   *  Для packaging-order: photo = первое фото PackagingItem, modelName = orderNumber,
   *  href ведёт в /packaging-orders/[id]. Drag-n-drop отключён. */
  kind?: "model" | "packaging-order";
};

export type KanbanColumn = {
  key: string;
  title: string;
  dot: string;
  group: "development" | "post_order" | "done";
};

export function BoardClient({
  columns,
  buckets,
  currentUserId,
  isAdmin,
}: {
  columns: ReadonlyArray<KanbanColumn>;
  buckets: Record<string, KanbanCard[]>;
  currentUserId?: string;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<{ id: string; name: string } | null>(null);
  // На мобиле 8 колонок шириной 210px не помещаются. Раньше показывали ровно
  // одну колонку по pill-табу — но так теряется ощущение доски. Теперь мобильный
  // свайп-пейджер: все колонки лежат в горизонтальном scroll-snap контейнере,
  // одна колонка = один экран (w-[calc(100vw-2rem)] snap-center). Чипы-колонки
  // сверху — якоря: тап скроллит к колонке, скролл подсвечивает текущую.
  const firstNonEmpty = columns.find((c) => (buckets[c.key] ?? []).length > 0)?.key ?? columns[0].key;
  const [mobileCol, setMobileCol] = useState<string>(firstNonEmpty);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Record<string, HTMLElement | null>>({});
  // Тап по чипу — плавно доскроллить колонку к центру экрана.
  const scrollToCol = useCallback((key: string) => {
    setMobileCol(key);
    colRefs.current[key]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);
  // Скролл пейджера подсвечивает чип по колонке, ближайшей к центру видимой области.
  const onScrollerScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const mid = scroller.scrollLeft + scroller.clientWidth / 2;
    let bestKey = columns[0]?.key;
    let bestDist = Infinity;
    for (const col of columns) {
      const el = colRefs.current[col.key];
      if (!el) continue;
      const center = el.offsetLeft + el.offsetWidth / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist) { bestDist = dist; bestKey = col.key; }
    }
    if (bestKey) setMobileCol((prev) => (prev === bestKey ? prev : bestKey));
  }, [columns]);
  // П4 UX-аудита: «Завершено» (23 карточки) свёрнуто по умолчанию — экономит
  // экран под живую работу. Клик по узкой колонке раскрывает, выбор запоминается.
  const [doneCollapsed, setDoneCollapsed] = usePersistedState<boolean>("kanban:done-collapsed:v1", true);
  // §4: тумблер «компактно» — мини-карточки, выбор запоминается. На мобиле
  // карточки всегда компактные (см. mobileCompact ниже), тумблер — только десктоп.
  const [compact, setCompact] = usePersistedState<boolean>("kanban:compact:v1", false);
  // Мобилка стартует с первой непустой колонки в центре пейджера.
  useEffect(() => {
    const el = colRefs.current[firstNonEmpty];
    if (el && scrollerRef.current && window.matchMedia("(max-width: 767px)").matches) {
      el.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
    }
    // один раз при маунте: доскроллить к стартовой колонке
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fmtDM(iso: string) {
    const [, m, d] = iso.split("-");
    return `${d}.${m}`;
  }

  async function handleDrop(targetKey: string, modelId: string) {
    setDropZone(null);
    setDragging(null);
    const createTarget = ORDER_CREATE_TARGETS[targetKey];
    if (createTarget) {
      // Пост-заказная колонка — открываем форму создания заказа с
      // предвыбранным этапом. После сохранения карточка встанет ровно сюда
      // (этап = колонка, единый источник правды в lib/order-stage).
      const ok = window.confirm(`Создать заказ для этой модели на этапе «${createTarget.label}»?`);
      if (!ok) return;
      router.push(`/orders/new?modelId=${modelId}&stage=${createTarget.status}`);
      return;
    }
    if (!DEV_TARGETS.has(targetKey)) {
      // прочие колонки — drag не поддержан, тихо игнорируем
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/models/${modelId}/kanban-stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStage: targetKey }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось перевести фасон");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-4 -mx-4 px-4 md:overflow-x-auto">
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Тумблер «компактно» — только десктоп (на мобиле и так одна колонка) */}
      <div className="mb-2 hidden justify-end md:flex">
        <button
          type="button"
          onClick={() => setCompact((v) => !v)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            compact ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {compact ? "✓ компактно" : "компактно"}
        </button>
      </div>

      {/* Мобильные чипы-якоря колонок — sticky сверху. Тап скроллит пейджер к
          колонке, свайп пейджера подсвечивает текущий чип. */}
      <div className="sticky top-0 z-10 -mx-4 mb-3 overflow-x-auto bg-slate-50 px-4 py-1 dark:bg-black md:hidden">
        <div className="flex gap-1.5 whitespace-nowrap">
          {columns.map((col) => {
            const count = (buckets[col.key] ?? []).length;
            const active = col.key === mobileCol;
            return (
              <button
                key={col.key}
                type="button"
                onClick={() => scrollToCol(col.key)}
                className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
                <span>{col.title}</span>
                <span
                  className={`rounded-full px-1.5 text-[10px] font-semibold ${
                    active ? "bg-white/20 text-white dark:bg-black/20 dark:text-slate-900" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Групповые шапки над колонками — только десктоп. */}
      <div className="hidden gap-3 mb-2 md:flex">
        <div className="flex gap-3 shrink-0">
          <div className="w-[210px] shrink-0 px-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-purple-600 dark:text-purple-300">Разработка</div>
            <div className="text-[10px] text-slate-400">видна только на канбане</div>
          </div>
          <div className="w-[210px] shrink-0"></div>
          <div className="w-[210px] shrink-0"></div>
          <div className="w-[210px] shrink-0"></div>
        </div>
        <div className="flex gap-3 shrink-0">
          <div className="w-[210px] shrink-0 px-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-green-600 dark:text-green-300">После заказа</div>
            <div className="text-[10px] text-slate-400">синхронизировано с Гантом</div>
          </div>
          <div className="w-[210px] shrink-0"></div>
          <div className="w-[210px] shrink-0"></div>
        </div>
        {!doneCollapsed && (
          <div className="flex gap-3 shrink-0">
            <div className="w-[210px] shrink-0 px-1">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Завершено</div>
              <div className="text-[10px] text-slate-400">только дата прибытия</div>
            </div>
          </div>
        )}
      </div>

      <div
        ref={scrollerRef}
        onScroll={onScrollerScroll}
        className="-mx-4 flex snap-x snap-mandatory flex-row gap-3 overflow-x-auto px-4 md:mx-0 md:snap-none md:overflow-visible md:px-0"
      >
        {columns.map((col) => {
          const cards = buckets[col.key] ?? [];
          const isDevTarget = DEV_TARGETS.has(col.key);
          const isOrderCreateTarget = col.key in ORDER_CREATE_TARGETS;
          const canDrop = isDevTarget || isOrderCreateTarget;
          const isOver = dropZone === col.key;

          // Свёрнутая «Завершено» — узкая вертикальная плашка на десктопе;
          // на мобиле это отдельная страница пейджера (колонка целиком).
          if (col.key === "done" && doneCollapsed) {
            return (
              <button
                key={col.key}
                ref={(el) => { colRefs.current[col.key] = el; }}
                type="button"
                onClick={() => setDoneCollapsed(false)}
                title="Показать завершённые"
                className="flex min-h-[44px] w-[calc(100vw-2rem)] shrink-0 snap-center flex-row items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-500 hover:bg-slate-100 md:w-[44px] md:flex-col md:justify-start md:px-2"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.dot }} />
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {cards.length}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider md:[writing-mode:vertical-rl]">
                  {col.title}
                </span>
                <span className="ml-auto text-xs md:ml-0 md:mt-auto">▸</span>
              </button>
            );
          }

          return (
            <div
              key={col.key}
              ref={(el) => { colRefs.current[col.key] = el; }}
              className={`flex w-[calc(100vw-2rem)] shrink-0 snap-center flex-col rounded-xl border border-slate-200 bg-white transition md:w-[210px] ${
                isOver ? "ring-2 ring-blue-400 ring-offset-1 dark:ring-blue-400/30" : ""
              } ${
                dragging && !canDrop ? "opacity-50" : ""
              }`}
              onDragOver={(e) => {
                if (!canDrop || !dragging) return;
                e.preventDefault();
                setDropZone(col.key);
              }}
              onDragLeave={() => {
                if (dropZone === col.key) setDropZone(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragging) return;
                handleDrop(col.key, dragging);
              }}
            >
              <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-100 bg-white rounded-t-xl">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.dot }} />
                <span className="text-sm font-semibold flex-1">{col.title}</span>
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{cards.length}</span>
                {col.key === "done" && (
                  <button
                    type="button"
                    onClick={() => setDoneCollapsed(true)}
                    title="Свернуть завершённые"
                    className="rounded px-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    ◂
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2 p-2 min-h-[120px]">
                {cards.length === 0 && (
                  <div className="text-center text-xs text-slate-400 py-8 border-2 border-dashed border-slate-200 rounded-lg">
                    {isOver ? "отпускай сюда" : "пусто"}
                  </div>
                )}
                {cards.map((c) => (
                  <KanbanCardView
                    key={`${c.modelId}:${c.orderId ?? "noord"}:${c.columnKey ?? ""}`}
                    c={c}
                    dragging={dragging}
                    onDragStartCard={() => setDragging(c.modelId)}
                    onDragEndCard={() => { setDragging(null); setDropZone(null); }}
                    onOpenComments={() => setOpenComments({ id: c.modelId, name: c.modelName })}
                    fmtDM={fmtDM}
                    compact={compact}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {saving && (
        <div className="fixed bottom-4 right-4 bg-slate-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg">
          Сохраняем…
        </div>
      )}

      {openComments && (
        <CommentsDrawer
          modelId={openComments.id}
          modelName={openComments.name}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => setOpenComments(null)}
        />
      )}
    </div>
  );
}

// ── Карточка фасона (компактная, без инста-обёртки) ──────────────────────
// Иконка комментария оставлена для пустого состояния блока комментов.
const IG_MINI = "shrink-0 text-slate-400";
function MiniComment() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={IG_MINI}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>;
}

function KanbanCardView({
  c,
  dragging,
  onDragStartCard,
  onDragEndCard,
  onOpenComments,
  fmtDM,
  compact = false,
}: {
  c: KanbanCard;
  dragging: string | null;
  onDragStartCard: () => void;
  onDragEndCard: () => void;
  onOpenComments: () => void;
  fmtDM: (iso: string) => string;
  compact?: boolean;
}) {
  const isPackaging = c.kind === "packaging-order";
  const dragEnabled = !isPackaging && !c.orderNumber;
  const isDone = c.columnKey === "done";
  const href = isPackaging ? `/packaging-orders/${c.modelId}` : `/models/${c.modelId}`;
  const dlClass = isDone
    ? "text-slate-600 bg-slate-100"
    : c.dlColor === "red" ? "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-400/10"
    : c.dlColor === "amber" ? "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-400/10"
    : "text-slate-500 bg-slate-100";
  const dlPrefix = isDone ? "📦" : c.dlColor === "red" ? "🔥" : c.dlColor === "amber" ? "⚠️" : "📅";

  const photos = c.photos?.length ? c.photos : c.photo ? [c.photo] : [];
  const [idx, setIdx] = useState(0);
  const cur = photos.length ? idx % photos.length : 0;
  const commentCount = c.commentCount ?? 0;
  const lastComments = c.lastComments ?? [];

  // П2: на мобиле карточка ВСЕГДА компактная — фото-миниатюра 56×56 слева,
  // справа название, цвето-кружки, фабрика, № заказа/дедлайн. Тап — как обычно
  // (фасон/заказ). Drag на тач не нужен. Десктоп рендерит своё ниже (md:hidden).
  const mobileCard = (
    <Link
      href={href}
      onClick={(e) => { if (dragging) e.preventDefault(); }}
      className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 transition active:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:active:bg-slate-800 md:hidden"
    >
      {photos.length > 0 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photos[0]} alt="" draggable={false} className={`h-14 w-14 shrink-0 rounded-lg object-cover ${isDone ? "opacity-80 grayscale" : ""}`} />
      ) : (
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-center text-[8px] font-medium leading-tight"
          style={{ background: `linear-gradient(135deg, ${c.palette[0]}, ${c.palette[1]})`, color: isLightColor(c.palette[0]) ? "#334155" : "rgba(255,255,255,0.92)" }}
        >
          {isPackaging ? "📦" : ""}
        </span>
      )}
      <span className="min-w-0 flex-1 space-y-1">
        <span className="line-clamp-1 text-sm font-medium leading-tight text-slate-900">{c.modelName}</span>
        {c.colorChips.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            {c.colorChips.slice(0, 6).map((cc, i) => (<span key={i} className="inline-block h-3 w-3 rounded-full ring-1 ring-slate-200 dark:ring-slate-600" style={{ backgroundColor: cc.hex }} />))}
            {c.colorChips.length > 6 && <span className="text-[10px] text-slate-400">+{c.colorChips.length - 6}</span>}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-1 text-[11px]">
          {c.orderStatusLabel && <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">{c.orderStatusLabel}</span>}
          {c.factoryName && <span className="max-w-[130px] truncate rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">🏭 {c.factoryName}</span>}
          {c.orderNumber && <span className="font-mono text-slate-500 dark:text-slate-400">{c.orderNumber}</span>}
          {commentCount > 0 && <span className="text-slate-500 dark:text-slate-400">💬{commentCount}</span>}
        </span>
      </span>
      {c.deadline && (
        <span className={`shrink-0 self-start rounded px-1.5 py-0.5 text-[10px] ${dlClass}`}>{dlPrefix} {fmtDM(c.deadline.iso)}</span>
      )}
    </Link>
  );

  // §4: компактный режим — мини-фото строкой вместо большой карточки,
  // колонки по 16-21 карточке перестают быть километрами скролла. Десктоп-only:
  // на мобиле выше отдельная карточка (mobileCard).
  if (compact) {
    return (
      <>
        {mobileCard}
        <div
          draggable={dragEnabled}
          onDragStart={(e) => { if (!dragEnabled) return; onDragStartCard(); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={onDragEndCard}
          className={`hidden overflow-hidden rounded-xl border border-slate-200 bg-white transition-all hover:shadow-md md:block ${
            dragEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
          } ${dragging === c.modelId ? "rotate-1 opacity-40" : ""}`}
        >
          <Link href={href} className="flex items-center gap-2 p-1.5" onClick={(e) => { if (dragging) e.preventDefault(); }}>
            {photos.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photos[0]} alt="" draggable={false} className={`h-9 w-9 shrink-0 rounded-lg object-cover ${isDone ? "opacity-80 grayscale" : ""}`} />
            ) : (
              <span className="h-9 w-9 shrink-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${c.palette[0]}, ${c.palette[1]})` }} />
            )}
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 text-[11px] font-medium leading-tight text-slate-900">{c.modelName}</span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                {c.orderNumber && <span className="font-mono">{c.orderNumber}</span>}
                {commentCount > 0 && <span>💬{commentCount}</span>}
              </span>
            </span>
            {c.deadline && (
              <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] ${dlClass}`}>{dlPrefix} {fmtDM(c.deadline.iso)}</span>
            )}
          </Link>
        </div>
      </>
    );
  }

  const wrapper = (
    <>
    {mobileCard}
    <div
      draggable={dragEnabled}
      onDragStart={(e) => { if (!dragEnabled) return; onDragStartCard(); e.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={onDragEndCard}
      className={`group/card hidden overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:shadow-md md:block ${
        dragEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${dragging === c.modelId ? "rotate-1 opacity-40" : ""}`}
    >
      <Link href={href} className="block" onClick={(e) => { if (dragging) e.preventDefault(); }}>
        {/* Фото / карусель */}
        <div className="group/ph relative w-full bg-slate-100">
          {photos.length > 0 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos[cur]} alt="" draggable={false} className={`aspect-square w-full object-cover ${isDone ? "opacity-80 grayscale" : ""}`} />
              {photos.length > 1 && (
                <>
                  <button type="button" aria-label="Пред. фото" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx((i) => (i - 1 + photos.length) % photos.length); }} className="absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-base text-slate-700 shadow transition md:h-6 md:w-6 md:text-sm md:opacity-0 md:group-hover/ph:opacity-100">‹</button>
                  <button type="button" aria-label="След. фото" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx((i) => (i + 1) % photos.length); }} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-base text-slate-700 shadow transition md:h-6 md:w-6 md:text-sm md:opacity-0 md:group-hover/ph:opacity-100">›</button>
                  <div className="absolute right-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white">{cur + 1}/{photos.length}</div>
                  <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1">
                    {photos.slice(0, 7).map((_, i) => (<span key={i} className={`h-1 rounded-full ${i === cur ? "w-2.5 bg-white" : "w-1 bg-white/60"}`} />))}
                  </div>
                </>
              )}
            </>
          ) : (
            // Заглушка без фото: текст контрастен фону-градиенту (белое пятно
            // «Костюм с брюками» в тёмной теме). Цвет — ИНЛАЙНОМ: глобальный
            // dark-слой перекрашивает text-slate-* в светлое, а градиент
            // остаётся светлым — класс тут даёт светлое-на-светлом.
            <div
              className="flex aspect-square w-full items-center justify-center px-2 text-center text-[11px] font-medium"
              style={{
                background: `linear-gradient(135deg, ${c.palette[0]}, ${c.palette[1]})`,
                color: isLightColor(c.palette[0]) ? "#334155" : "rgba(255,255,255,0.92)",
              }}
            >
              {c.modelName}
            </div>
          )}
        </div>

        <div className="space-y-1 px-2 pb-2 pt-2">
          <div className="line-clamp-1 text-[12px] font-medium leading-tight text-slate-900">
            {c.modelName}
          </div>
          {c.colorChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1" title={c.colorChips.map((x) => x.name).join(", ")}>
              {c.colorChips.slice(0, 6).map((cc, i) => (<span key={i} className="inline-block h-3 w-3 rounded-full ring-1 ring-slate-200" style={{ backgroundColor: cc.hex }} />))}
              {c.colorChips.length > 6 && <span className="text-[10px] text-slate-400">+{c.colorChips.length - 6}</span>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1">
            {/* Точный статус заказа: колонка «ОТК» вмещает ОТК и «Готов к отгрузке» */}
            {c.orderStatusLabel && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
                {c.orderStatusLabel}
              </span>
            )}
            {c.factoryName && <span className="max-w-[120px] truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">🏭 {c.factoryName}</span>}
            {c.qty > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">{c.qty.toLocaleString("ru-RU")} шт</span>}
            {c.deadline && <span className={`rounded px-1.5 py-0.5 text-[10px] ${dlClass}`}>{dlPrefix} {fmtDM(c.deadline.iso)}</span>}
          </div>
        </div>
      </Link>

      {/* Превью комментариев — клик открывает переписку */}
      {!isPackaging && (
        <button
          type="button"
          onClick={onOpenComments}
          className="block w-full border-t border-slate-100 px-2 py-1.5 text-left hover:bg-slate-50"
        >
          {commentCount > 0 && lastComments.length > 0 ? (
            <span className="block space-y-0.5">
              {lastComments.map((cm, i) => (
                <span key={i} className="line-clamp-1 text-[11px] text-slate-700">
                  <span className="font-semibold">{cm.author}:</span> {cm.snippet}
                  {cm.photos > 0 && <span className="text-slate-400"> 📷{cm.photos}</span>}
                </span>
              ))}
              {commentCount > lastComments.length && (
                <span className="block text-[10px] text-blue-600 dark:text-blue-300">Показать все {commentCount} →</span>
              )}
            </span>
          ) : (
            // §4: пустой плейсхолдер не мозолит глаза — появляется по наведению на карточку
            <span className="flex items-center gap-1 text-[11px] text-slate-400 opacity-0 transition group-hover/card:opacity-100">
              <MiniComment /> Оставить комментарий
            </span>
          )}
        </button>
      )}

      {/* Ссылки на заказ/Гант */}
      {!isPackaging && c.orderId && (
        <div className="flex border-t border-slate-100 text-[10px]">
          <Link href={`/orders/${c.orderId}`} className="flex-1 truncate border-r border-slate-100 px-2 py-1.5 text-center text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-400/10">#{c.orderNumber}</Link>
          <Link href={`/gantt-v2`} className="px-2 py-1.5 text-slate-600 hover:bg-slate-50" title="Гант">📊 Гант</Link>
        </div>
      )}
    </div>
    </>
  );

  return wrapper;
}
