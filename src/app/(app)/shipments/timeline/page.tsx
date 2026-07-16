import Link from "next/link";
import { formatDate } from "@/lib/format";
import { SHIPMENT_STATUS_LABELS } from "@/lib/constants";
import { loadShipmentsWithPreview } from "@/server/cargo-preview";

/**
 * График карго (Алёна 16.07): все доставки стартовали и приехали в разное
 * время — простая гант-визуализация: полоса от выезда до прибытия (факт,
 * иначе план, иначе сегодня), линия «сегодня». Без drag — только смотреть;
 * даты правятся в карточке карго.
 */

export const dynamic = "force-dynamic"; // живые данные, не билд-снапшот

const DAY = 86_400_000;

function dayN(d: Date): number {
  return Math.floor(d.getTime() / DAY);
}

export default async function ShipmentsTimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show: showParam } = await searchParams;
  // По умолчанию — только активные (едут/черновики); приехавшие не забивают график (Алёна 17.07).
  const show = showParam === "done" || showParam === "all" ? showParam : "active";

  const all = await loadShipmentsWithPreview();
  const withDate = all
    .filter((s) => s.departDate != null)
    .sort((a, b) => a.departDate!.getTime() - b.departDate!.getTime());

  const isDone = (s: (typeof withDate)[number]) => s.status === "ARRIVED" || s.status === "RECEIVED";
  const counts = {
    active: withDate.filter((s) => !isDone(s)).length,
    done: withDate.filter(isDone).length,
    all: withDate.length,
  };
  const rows =
    show === "all" ? withDate : show === "done" ? withDate.filter(isDone) : withDate.filter((s) => !isDone(s));

  const today = dayN(new Date());

  const ends = rows.map((s) =>
    dayN(s.arrivalActualDate ?? s.arriveDate ?? new Date()),
  );
  const starts = rows.map((s) => dayN(s.departDate!));
  const min = Math.min(...starts, today) - 2;
  const max = Math.max(...ends, today) + 2;
  const span = Math.max(1, max - min);
  const pct = (d: number) => ((d - min) / span) * 100;

  const barColor = (status: string, late: boolean) => {
    if (status === "ARRIVED" || status === "RECEIVED")
      return "bg-emerald-500/70 dark:bg-emerald-400/60";
    if (late) return "bg-amber-500 dark:bg-amber-400";
    if (status === "IN_TRANSIT") return "bg-blue-500 dark:bg-blue-400";
    return "bg-slate-400 dark:bg-slate-500";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Карго · график</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Полоса = от выезда до прибытия (синие едут, жёлтые опаздывают, зелёные приехали)
          </p>
          <div className="mt-2 flex gap-1.5">
            {(
              [
                ["active", `Едут (${counts.active})`],
                ["done", `Приехали (${counts.done})`],
                ["all", `Все (${counts.all})`],
              ] as const
            ).map(([key, label]) => (
              <Link
                key={key}
                href={key === "active" ? "/shipments/timeline" : `/shipments/timeline?show=${key}`}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  show === key
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="ml-auto flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
          <Link href="/shipments" className="rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700">
            Карго
          </Link>
          <span className="rounded-md bg-white px-3 py-1 text-sm font-medium text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100">
            График
          </span>
          <Link href="/incoming" className="rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700">
            Заказы в пути
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          {show === "active"
            ? "Сейчас ничего не едет — все карго приехали. Переключись на «Приехали» или «Все»."
            : "Нет карго с датой выезда — заполните даты в карточках карго."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white p-4 dark:bg-slate-900">
          <div className="min-w-[640px]">
            {/* Шкала-шапка: сегодня */}
            <div className="relative mb-2 h-5 border-b border-slate-100 dark:border-slate-800">
              <div className="absolute top-0 h-full" style={{ left: `calc(240px + (100% - 240px) * ${pct(today) / 100})` }}>
                <span className="rounded bg-rose-500 px-1 text-[10px] font-medium text-white">сегодня</span>
              </div>
            </div>

            <div className="space-y-1.5">
              {rows.map((s) => {
                const start = dayN(s.departDate!);
                const end = dayN(s.arrivalActualDate ?? s.arriveDate ?? new Date());
                const late =
                  !s.arrivalActualDate &&
                  s.arriveDate != null &&
                  dayN(s.arriveDate) < today &&
                  s.status !== "ARRIVED" &&
                  s.status !== "RECEIVED";
                const left = pct(start);
                const width = Math.max(1.5, pct(Math.max(end, start + 1)) - left);
                return (
                  <Link key={s.id} href={`/shipments/${s.id}`} className="group flex items-center gap-0 rounded-lg py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="w-[240px] shrink-0 pr-3">
                      <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{s.preview.title}</div>
                      <div className="truncate font-mono text-[10px] text-slate-400">
                        {s.cargoNumber ?? s.number} · {formatDate(s.departDate!)} → {s.arrivalActualDate ? formatDate(s.arrivalActualDate) : s.arriveDate ? formatDate(s.arriveDate) : "?"}
                      </div>
                    </div>
                    <div className="relative h-6 flex-1">
                      {/* линия сегодня */}
                      <div className="absolute inset-y-0 w-px bg-rose-300 dark:bg-rose-500/50" style={{ left: `${pct(today)}%` }} />
                      <div
                        className={`absolute inset-y-1 rounded-full ${barColor(s.status, late)}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${SHIPMENT_STATUS_LABELS[s.status]}${late ? " · опаздывает" : ""}`}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
