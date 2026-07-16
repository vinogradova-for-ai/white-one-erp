import Link from "next/link";
import { getDataGaps, countGaps } from "@/lib/queries/data-gaps";

// «Дыры в данных» — одно место, где видно всё незаполненное, из-за чего
// кабинет врёт. Каждая строка — ссылка туда, где дыру можно закрыть.
export const dynamic = "force-dynamic";

export default async function DataGapsPage() {
  const allSections = await getDataGaps();
  const total = countGaps(allSections);
  // §4 UX-аудита: «врут деньги» — первыми (согласовано с красным бейджем на главной).
  const sections = [...allSections].sort((a, b) => Number(!!b.money) - Number(!!a.money));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">
          Дыры в данных
        </h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Всё незаполненное, из-за чего цифры в кабинете врут. Кликни строку —
          попадёшь туда, где это чинится. Пустой раздел = всё заполнено.
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-400/20 bg-emerald-50 dark:bg-emerald-400/10 p-8 text-center text-emerald-800 dark:text-emerald-300">
          Дыр нет — все данные заполнены 🎉
        </div>
      ) : (
        <div className="space-y-3">
          {/* §4: секции свёрнуты до заголовков со счётчиками — обзор в один экран.
              В строках колонка «чья дыра» — чтобы раздавать, а не чинить самой. */}
          {sections.map((s) =>
            s.rows.length === 0 ? (
              <section
                key={s.key}
                className="flex items-baseline justify-between gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 dark:border-emerald-400/20"
              >
                <h2 className="text-sm font-semibold text-slate-900">{s.title}</h2>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                  ✓
                </span>
              </section>
            ) : (
              <details key={s.key} className="group rounded-2xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-baseline gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="text-slate-400 transition group-open:rotate-90">▸</span>
                  <h2 className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
                    {s.money && <span title="Эта дыра врёт деньги" aria-label="врут деньги">🔴 </span>}
                    {s.title}
                  </h2>
                  <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-red-700 dark:bg-red-400/10 dark:text-red-300">
                    {s.rows.length}
                    {s.extra ? ` · ${s.extra}` : ""}
                  </span>
                </summary>
                <div className="border-t border-slate-100 px-4 pb-3">
                  <p className="mt-2 text-xs text-slate-500">{s.why}</p>
                  <ul className="mt-2 max-h-96 space-y-0.5 overflow-y-auto">
                    {s.rows.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={r.href}
                          className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                        >
                          <span className="min-w-0 truncate text-slate-900">{r.title}</span>
                          <span className="flex shrink-0 items-baseline gap-2">
                            {r.subtitle && <span className="text-xs text-slate-400">{r.subtitle}</span>}
                            {r.owner && (
                              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                {r.owner}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ),
          )}
        </div>
      )}
    </div>
  );
}
