import Link from "next/link";
import { formatDate } from "@/lib/format";
import { SHIPMENT_STATUS_LABELS } from "@/lib/constants";
import { loadShipmentsWithPreview } from "@/server/cargo-preview";

/**
 * График карго (Алёна 16-17.07): полоса = от выезда до прибытия (факт, иначе
 * план, иначе сегодня). Оформление как у большого Ганта (/gantt-v2): недельная
 * шкала по понедельникам, вертикальная сетка, начало месяца жирнее, линия
 * «сегодня». По умолчанию видны только едущие; чипы Едут/Приехали/Все.
 * Без drag — даты правятся в карточке карго.
 */

export const dynamic = "force-dynamic"; // живые данные, не билд-снапшот

const DAY = 86_400_000;

function dayN(d: Date): number {
  return Math.floor(d.getTime() / DAY);
}

function fmtDM(dn: number): string {
  const d = new Date(dn * DAY);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function ShipmentsTimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show: showParam } = await searchParams;
  // По умолчанию — только активные (едут/черновики); приехавшие не забивают график.
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
  const ends = rows.map((s) => dayN(s.arrivalActualDate ?? s.arriveDate ?? new Date()));
  const starts = rows.map((s) => dayN(s.departDate!));
  const min = Math.min(...(starts.length ? starts : [today]), today) - 3;
  const max = Math.max(...(ends.length ? ends : [today]), today) + 3;
  const span = Math.max(1, max - min);
  const pct = (d: number) => ((d - min) / span) * 100;

  // Недельные метки по понедельникам (как в /gantt-v2), начало месяца — жирнее.
  const weekMarks: Array<{ dn: number; pct: number; label: string; isMonthStart: boolean }> = [];
  {
    const start = new Date(min * DAY);
    const offset = (start.getUTCDay() + 6) % 7;
    let cur = min - offset;
    if (cur < min) cur += 7;
    for (; cur <= max; cur += 7) {
      const d = new Date(cur * DAY);
      weekMarks.push({ dn: cur, pct: pct(cur), label: fmtDM(cur), isMonthStart: d.getUTCDate() <= 7 });
    }
  }

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
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="min-w-[900px]">
            {/* Шкала сверху — как в большом Ганте */}
            <div className="sticky top-0 z-20 grid grid-cols-[240px_1fr] border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Карго</div>
              <div className="relative h-8">
                {weekMarks.map((m) => (
                  <div key={m.dn} className="absolute top-0 h-full text-[10px] text-slate-400" style={{ left: `${m.pct}%` }}>
                    <div className={`h-full border-l ${m.isMonthStart ? "border-slate-400 dark:border-slate-500" : "border-slate-200 dark:border-slate-700"}`} />
                    <div className={`absolute -translate-x-1/2 pt-1 ${m.isMonthStart ? "font-semibold text-slate-600 dark:text-slate-300" : ""}`} style={{ left: 0, top: 0 }}>
                      {m.label}
                    </div>
                  </div>
                ))}
                {/* сегодня в шкале */}
                <div className="absolute top-0 z-10 h-full" style={{ left: `${pct(today)}%` }}>
                  <div className="h-full border-l-2 border-rose-400" />
                  <span className="absolute -translate-x-1/2 rounded bg-rose-500 px-1 text-[10px] font-medium text-white" style={{ top: 0 }}>
                    сегодня
                  </span>
                </div>
              </div>
            </div>

            {/* Строки */}
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
              const width = Math.max(1.2, pct(Math.max(end, start + 1)) - left);
              return (
                <Link
                  key={s.id}
                  href={`/shipments/${s.id}`}
                  className="grid grid-cols-[240px_1fr] border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0 px-3 py-1.5">
                    <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{s.preview.title}</div>
                    <div className="truncate font-mono text-[10px] text-slate-400">
                      {s.cargoNumber ?? s.number} · {formatDate(s.departDate!)} → {s.arrivalActualDate ? formatDate(s.arrivalActualDate) : s.arriveDate ? formatDate(s.arriveDate) : "?"}
                    </div>
                  </div>
                  <div className="relative h-11">
                    {/* сетка недель в строке */}
                    {weekMarks.map((m) => (
                      <div
                        key={m.dn}
                        className={`absolute inset-y-0 border-l ${m.isMonthStart ? "border-slate-200 dark:border-slate-700" : "border-slate-100 dark:border-slate-800"}`}
                        style={{ left: `${m.pct}%` }}
                      />
                    ))}
                    {/* линия сегодня */}
                    <div className="absolute inset-y-0 border-l-2 border-rose-300 dark:border-rose-500/60" style={{ left: `${pct(today)}%` }} />
                    {/* полоса с датами по краям */}
                    <div
                      className={`absolute inset-y-2.5 rounded-full ${barColor(s.status, late)}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${SHIPMENT_STATUS_LABELS[s.status]}${late ? " · опаздывает" : ""}: ${formatDate(s.departDate!)} → ${s.arrivalActualDate ? formatDate(s.arrivalActualDate) : s.arriveDate ? formatDate(s.arriveDate) : "?"}`}
                    >
                      <span className="absolute -left-1 top-1/2 -translate-x-full -translate-y-1/2 text-[10px] tabular-nums text-slate-400">
                        {fmtDM(start)}
                      </span>
                      <span className="absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full text-[10px] tabular-nums text-slate-400">
                        {fmtDM(end)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Легенда — как в большом Ганте */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-blue-500 align-middle" />едет</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-amber-500 align-middle" />опаздывает</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-emerald-500/70 align-middle" />приехало</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-slate-400 align-middle" />черновик</span>
      </div>
    </div>
  );
}
