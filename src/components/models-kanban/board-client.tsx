"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Колонки куда МОЖНО таскать (drag-target). Колонки 5–8 (после заказа)
// в этот список не входят — они только показывают результат, изменения
// идут через Гант.
const DEV_TARGETS = new Set(["idea", "sample", "ideal_sample", "sizing_done"]);

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
  deadline: { iso: string; label: string } | null;
  dlColor: "red" | "amber" | "gray" | null;
  colorChips: Array<{ name: string; hex: string }>;
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
}: {
  columns: ReadonlyArray<KanbanColumn>;
  buckets: Record<string, KanbanCard[]>;
}) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // На мобиле 8 колонок шириной 210px не помещаются — на 390px видно только
  // 1.5 колонки и пользователь теряется. Поэтому на ≤md показываем одну
  // колонку, выбираемую через pill-табы со счётчиками. Дефолт — первая
  // непустая колонка (обычно «Идея»). На десктопе всё как было.
  const firstNonEmpty = columns.find((c) => (buckets[c.key] ?? []).length > 0)?.key ?? columns[0].key;
  const [mobileCol, setMobileCol] = useState<string>(firstNonEmpty);

  function fmtDM(iso: string) {
    const [, m, d] = iso.split("-");
    return `${d}.${m}`;
  }

  async function handleDrop(targetKey: string, modelId: string) {
    setDropZone(null);
    setDragging(null);
    if (targetKey === "production") {
      // На колонку «Производство» — редирект в форму создания заказа с
      // предзаполненной моделью. После сохранения карточка сама окажется
      // в Производстве через ORDER_STATUS_TO_COL.
      const ok = window.confirm("Создать заказ для этой модели?");
      if (!ok) return;
      router.push(`/orders/new?modelId=${modelId}`);
      return;
    }
    if (!DEV_TARGETS.has(targetKey)) {
      // ОТК/Доставка/В продаже — drag запрещён, тихо игнорируем
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
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Мобильные pill-табы по колонкам — sticky сверху. */}
      <div className="-mx-4 mb-3 overflow-x-auto px-4 md:hidden">
        <div className="flex gap-1.5 whitespace-nowrap">
          {columns.map((col) => {
            const count = (buckets[col.key] ?? []).length;
            const active = col.key === mobileCol;
            return (
              <button
                key={col.key}
                type="button"
                onClick={() => setMobileCol(col.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
                <span>{col.title}</span>
                <span
                  className={`rounded-full px-1.5 text-[10px] font-semibold ${
                    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
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
            <div className="text-[10px] uppercase tracking-wider font-semibold text-purple-600">Разработка</div>
            <div className="text-[10px] text-slate-400">видна только на канбане</div>
          </div>
          <div className="w-[210px] shrink-0"></div>
          <div className="w-[210px] shrink-0"></div>
          <div className="w-[210px] shrink-0"></div>
        </div>
        <div className="flex gap-3 shrink-0">
          <div className="w-[210px] shrink-0 px-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-green-600">После заказа</div>
            <div className="text-[10px] text-slate-400">синхронизировано с Гантом</div>
          </div>
          <div className="w-[210px] shrink-0"></div>
          <div className="w-[210px] shrink-0"></div>
        </div>
        <div className="flex gap-3 shrink-0">
          <div className="w-[210px] shrink-0 px-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Завершено</div>
            <div className="text-[10px] text-slate-400">только дата прибытия</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        {columns.map((col) => {
          const cards = buckets[col.key] ?? [];
          const isDevTarget = DEV_TARGETS.has(col.key);
          const isProduction = col.key === "production";
          const canDrop = isDevTarget || isProduction;
          const isOver = dropZone === col.key;
          const isMobileActive = col.key === mobileCol;

          return (
            <div
              key={col.key}
              className={`flex flex-col bg-white rounded-xl border border-slate-200 transition w-full md:w-[210px] md:shrink-0 ${
                isMobileActive ? "" : "hidden md:flex"
              } ${isOver ? "ring-2 ring-blue-400 ring-offset-1" : ""} ${
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
              </div>
              <div className="flex flex-col gap-2 p-2 min-h-[120px]">
                {cards.length === 0 && (
                  <div className="text-center text-xs text-slate-400 py-8 border-2 border-dashed border-slate-200 rounded-lg">
                    {isOver ? "отпускай сюда" : "пусто"}
                  </div>
                )}
                {cards.map((c) => {
                  const dragEnabled = !c.orderNumber; // нет активного заказа = можно таскать в разработке
                  const isDone = c.columnKey === "done";
                  const dlClass = isDone
                    ? "text-slate-600 bg-slate-100"
                    : c.dlColor === "red" ? "text-red-700 bg-red-50"
                    : c.dlColor === "amber" ? "text-amber-700 bg-amber-50"
                    : "text-slate-500 bg-slate-100";
                  const dlPrefix = isDone
                    ? "📦"
                    : c.dlColor === "red" ? "🔥"
                    : c.dlColor === "amber" ? "⚠️" : "📅";
                  return (
                    <div
                      key={`${c.modelId}:${c.orderId ?? "noord"}:${c.columnKey ?? ""}`}
                      draggable={dragEnabled}
                      onDragStart={(e) => {
                        if (!dragEnabled) return;
                        setDragging(c.modelId);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => { setDragging(null); setDropZone(null); }}
                      className={`block bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-all ${
                        dragEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                      } ${dragging === c.modelId ? "opacity-40 rotate-1" : ""}`}
                    >
                      <Link href={`/models/${c.modelId}`} className="block" onClick={(e) => { if (dragging) e.preventDefault(); }}>
                        {c.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.photo}
                            alt=""
                            className={`w-full aspect-square object-cover bg-slate-100 ${
                              isDone ? "grayscale opacity-80" : ""
                            }`}
                            draggable={false}
                          />
                        ) : (
                          <div
                            className="w-full aspect-square flex items-center justify-center text-[11px] text-slate-500/60"
                            style={{ background: `linear-gradient(135deg, ${c.palette[0]}, ${c.palette[1]})` }}
                          >
                            {c.modelName}
                          </div>
                        )}
                        <div className="p-2 space-y-1">
                          <div className="text-[13px] font-semibold text-slate-900 line-clamp-1 leading-tight">{c.modelName}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {c.brandLabel} · {c.category}
                          </div>
                          {c.colorChips.length > 0 && (
                            <div className="flex flex-wrap gap-1 items-center" title={c.colorChips.map((x) => x.name).join(", ")}>
                              {c.colorChips.slice(0, 6).map((cc, i) => (
                                <span
                                  key={i}
                                  className="inline-block h-3 w-3 rounded-full ring-1 ring-slate-200"
                                  style={{ backgroundColor: cc.hex }}
                                  aria-label={cc.name}
                                />
                              ))}
                              {c.colorChips.length > 6 && (
                                <span className="text-[10px] text-slate-400">+{c.colorChips.length - 6}</span>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1">
                            {c.factoryName && (
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded truncate max-w-[120px]">
                                🏭 {c.factoryName}
                              </span>
                            )}
                            {c.qty > 0 && (
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                {c.qty.toLocaleString("ru-RU")} шт
                              </span>
                            )}
                            {c.deadline && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${dlClass}`}>
                                {dlPrefix} {fmtDM(c.deadline.iso)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                      {/* Ссылки в подвале карточки — только для пост-order (есть заказ) */}
                      {c.orderId && (
                        <div className="flex border-t border-slate-100 text-[10px]">
                          <Link
                            href={`/orders/${c.orderId}`}
                            className="flex-1 px-2 py-1.5 text-blue-600 hover:bg-blue-50 truncate text-center border-r border-slate-100"
                          >
                            #{c.orderNumber}
                          </Link>
                          <Link
                            href={`/gantt-v2`}
                            className="px-2 py-1.5 text-slate-600 hover:bg-slate-50"
                            title="Гант"
                          >
                            📊 Гант
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
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
    </div>
  );
}
