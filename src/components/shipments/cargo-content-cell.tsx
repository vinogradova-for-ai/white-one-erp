import type { CargoPreview } from "@/server/cargo-preview";

/**
 * «Что внутри» карго: фото + артикул + штук по позициям (Алёна 16.07:
 * «в превью вообще непонятно, что внутри едет»). Без фото — серый квадратик.
 */
export function CargoContentCell({ preview, compact = false }: { preview: CargoPreview; compact?: boolean }) {
  if (preview.items.length === 0) {
    return <span className="text-xs text-slate-400">{preview.title}</span>;
  }
  const shown = compact ? preview.items.slice(0, 2) : preview.items;
  const hidden = preview.moreCount + (preview.items.length - shown.length);
  return (
    <div className="flex flex-col gap-1">
      {shown.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          {it.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-[9px] text-slate-400 dark:bg-slate-800">
              нет
            </div>
          )}
          <span className="min-w-0 truncate text-sm text-slate-800 dark:text-slate-200">{it.label}</span>
          {it.qty != null && (
            <span className="shrink-0 text-xs tabular-nums text-slate-500">{it.qty.toLocaleString("ru-RU")} шт</span>
          )}
        </div>
      ))}
      {hidden > 0 && <span className="pl-10 text-xs text-slate-400">ещё {hidden}…</span>}
    </div>
  );
}
