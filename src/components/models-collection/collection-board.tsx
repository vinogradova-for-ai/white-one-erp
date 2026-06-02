"use client";

// Доска коллекции «Раскладка по цветам».
// Каждый фасон = ряд: технический флэт-контур, перекрашиваемый по клику.
// Источник истины — ProductModel.boardColors[] (hex). Пусто = фасон в библиотеке.
// Контур (flatSketchSvg) перекрашивается через CSS `color` (заливка = currentColor).
import { useCallback, useMemo, useState } from "react";

export type CollModel = {
  id: string;
  name: string;
  category: string;
  flatSvg: string | null;
  variantColors: Array<{ name: string; hex: string }>;
  boardColors: string[];
  collectionOrder: number | null;
};

// Базовая палитра бренда (имена согласованы со словарём color-map).
const PALETTE: Array<{ name: string; hex: string }> = [
  { name: "молочный", hex: "#f5ead0" }, { name: "кремовый", hex: "#f0dfc4" },
  { name: "бежевый", hex: "#e8d9bb" }, { name: "песочный", hex: "#e0c9a0" },
  { name: "пудра", hex: "#f0d8c9" }, { name: "розовый", hex: "#f0b7bf" },
  { name: "коралл", hex: "#e97a65" }, { name: "красный", hex: "#c1272d" },
  { name: "бордовый", hex: "#6c2030" }, { name: "шоколад", hex: "#5c3a22" },
  { name: "кэмел", hex: "#b8895a" }, { name: "горчичный", hex: "#b58b2a" },
  { name: "олива", hex: "#7a7a3a" }, { name: "зелёный", hex: "#3a7a4a" },
  { name: "изумруд", hex: "#1f6b54" }, { name: "бирюзовый", hex: "#2ea5a3" },
  { name: "голубой", hex: "#7fb8d5" }, { name: "синий", hex: "#2a4b8d" },
  { name: "тёмно-синий", hex: "#1e325a" }, { name: "сиреневый", hex: "#c0a8cf" },
  { name: "графит", hex: "#3a3f48" }, { name: "серый", hex: "#8b8f96" },
  { name: "чёрный", hex: "#14151a" }, { name: "белый", hex: "#f4f1ea" },
];

const DEFAULT_HEX = "#e8d9bb";

function save(id: string, patch: { boardColors?: string[]; collectionOrder?: number | null }) {
  fetch(`/api/models/${id}/board-colors`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

// Инлайн-SVG, перекрашенный в hex (заливка контура = currentColor).
function Flat({ svg, hex, height = 188 }: { svg: string; hex: string; height?: number }) {
  return (
    <div
      className="flat-svg shrink-0"
      style={{ color: hex, height }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function CollectionBoard({ models }: { models: CollModel[] }) {
  const [rows, setRows] = useState<Record<string, { boardColors: string[]; order: number | null }>>(
    () => Object.fromEntries(models.map((m) => [m.id, { boardColors: m.boardColors, order: m.collectionOrder }])),
  );
  const [dragId, setDragId] = useState<string | null>(null);

  // Имя цвета по hex (палитра + цвета вариантов фасонов).
  const nameByHex = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of PALETTE) map.set(p.hex.toLowerCase(), p.name);
    for (const m of models) for (const v of m.variantColors) if (!map.has(v.hex.toLowerCase())) map.set(v.hex.toLowerCase(), v.name);
    return map;
  }, [models]);
  const colorName = (hex: string) => nameByHex.get(hex.toLowerCase()) ?? hex;

  const withFlat = models.filter((m) => m.flatSvg);
  const onBoard = withFlat
    .filter((m) => (rows[m.id]?.boardColors.length ?? 0) > 0)
    .sort((a, b) => {
      const oa = rows[a.id]?.order, ob = rows[b.id]?.order;
      if (oa != null && ob != null) return oa - ob;
      if (oa != null) return -1;
      if (ob != null) return 1;
      return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    });
  const library = withFlat.filter((m) => (rows[m.id]?.boardColors.length ?? 0) === 0);
  const noFlatCount = models.length - withFlat.length;

  const update = useCallback((id: string, boardColors: string[], order?: number | null) => {
    setRows((prev) => ({ ...prev, [id]: { boardColors, order: order !== undefined ? order : prev[id]?.order ?? null } }));
    save(id, { boardColors, ...(order !== undefined ? { collectionOrder: order } : {}) });
  }, []);

  const addToBoard = (m: CollModel) => {
    const first = m.variantColors[0]?.hex ?? DEFAULT_HEX;
    const maxOrder = onBoard.reduce((mx, x) => Math.max(mx, rows[x.id]?.order ?? 0), 0);
    update(m.id, [first], maxOrder + 1);
  };
  const addColor = (id: string, hex: string) => {
    const cur = rows[id]?.boardColors ?? [];
    if (cur.includes(hex)) return;
    update(id, [...cur, hex]);
  };
  const removeColor = (id: string, idx: number) => {
    const cur = rows[id]?.boardColors ?? [];
    update(id, cur.filter((_, i) => i !== idx));
  };
  const removeRow = (id: string) => update(id, [], null);

  // drag-сортировка рядов
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = onBoard.map((m) => m.id);
    const from = ids.indexOf(dragId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setRows((prev) => {
      const next = { ...prev };
      ids.forEach((id, i) => { next[id] = { ...next[id], order: i + 1 }; save(id, { collectionOrder: i + 1 }); });
      return next;
    });
    setDragId(null);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#f5f3ee]">
      {/* Библиотека фасонов слева */}
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">Библиотека</div>
          <div className="text-[11px] text-slate-500">Нажми, чтобы добавить на доску</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {library.length === 0 && withFlat.length > 0 && (
            <div className="px-2 py-6 text-center text-xs text-slate-400">Все фасоны на доске</div>
          )}
          {withFlat.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-slate-400">
              Контуры ещё не сгенерированы.
            </div>
          )}
          {library.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => addToBoard(m)}
              className="mb-1 flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-slate-100"
              title="Добавить на доску"
            >
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-50 ring-1 ring-slate-200">
                {m.flatSvg && <Flat svg={m.flatSvg} hex="#cfc8bd" height={46} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-slate-800">{m.name}</span>
                <span className="block truncate text-[11px] text-slate-400">{m.category}</span>
              </span>
            </button>
          ))}
        </div>
        {noFlatCount > 0 && (
          <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
            Без контура: {noFlatCount}
          </div>
        )}
      </aside>

      {/* Доска: ряды по фасонам */}
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-[#f5f3ee]/95 px-6 py-3 backdrop-blur">
          <div>
            <div className="text-base font-semibold text-slate-900">Раскладка по цветам</div>
            <div className="text-[11px] text-slate-500">
              Добавь фасон из библиотеки → кликай цвета, чтобы докрашивать копии вправо. Ряды можно перетаскивать.
            </div>
          </div>
        </div>

        <div className="space-y-4 p-6">
          {onBoard.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center text-sm text-slate-400">
              Доска пустая. Добавь фасон из библиотеки слева.
            </div>
          )}

          {onBoard.map((m) => {
            const cols = rows[m.id]?.boardColors ?? [];
            const svg = m.flatSvg!;
            return (
              <div
                key={m.id}
                draggable
                onDragStart={() => setDragId(m.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(m.id)}
                className={`rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100 ${dragId === m.id ? "opacity-50" : ""}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="cursor-grab select-none text-slate-300" title="Перетащить ряд">⠿</span>
                    <span className="text-sm font-semibold text-slate-900">{m.name}</span>
                    <span className="text-[11px] text-slate-400">{m.category}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(m.id)}
                    className="rounded px-1 text-lg leading-none text-slate-300 hover:text-red-500"
                    title="Убрать с доски"
                  >
                    ×
                  </button>
                </div>

                <div className="flex items-start gap-3 overflow-x-auto pb-1">
                  {cols.map((hex, i) => (
                    <div key={i} className="group/copy relative flex flex-col items-center gap-1">
                      <div className="overflow-hidden rounded-lg ring-1 ring-slate-100">
                        <Flat svg={svg} hex={hex} />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeColor(m.id, i)}
                        className="absolute right-0 top-0 hidden h-5 w-5 items-center justify-center rounded-full bg-white text-xs text-slate-400 shadow group-hover/copy:flex hover:text-red-500"
                        title="Убрать цвет"
                      >
                        ×
                      </button>
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <span className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-slate-200" style={{ backgroundColor: hex }} />
                        {colorName(hex)}
                      </span>
                    </div>
                  ))}

                  {/* + цвет */}
                  <AddColor model={m} onPick={(hex) => addColor(m.id, hex)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Контрол добавления цвета: сначала цвета вариантов фасона, потом общая палитра.
function AddColor({
  model, onPick,
}: {
  model: CollModel;
  onPick: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const variantHexes = new Set(model.variantColors.map((v) => v.hex.toLowerCase()));
  return (
    <div className="relative flex flex-col items-center gap-2 self-center border-l border-dashed border-slate-200 pl-3">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50"
      >
        + цвет
      </button>
      {open && (
        <div className="absolute left-3 top-10 z-20 w-56 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl">
          {model.variantColors.length > 0 && (
            <>
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-slate-400">Цвета фасона</div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {model.variantColors.map((v) => (
                  <button
                    key={v.hex + v.name}
                    type="button"
                    onClick={() => { onPick(v.hex); setOpen(false); }}
                    title={v.name}
                    className="h-6 w-6 rounded-full ring-1 ring-slate-300 transition-transform hover:scale-110"
                    style={{ backgroundColor: v.hex }}
                  />
                ))}
              </div>
            </>
          )}
          <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-slate-400">Палитра</div>
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.filter((p) => !variantHexes.has(p.hex.toLowerCase())).map((p) => (
              <button
                key={p.hex}
                type="button"
                onClick={() => { onPick(p.hex); setOpen(false); }}
                title={p.name}
                className="h-6 w-6 rounded-full ring-1 ring-slate-300 transition-transform hover:scale-110"
                style={{ backgroundColor: p.hex }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
