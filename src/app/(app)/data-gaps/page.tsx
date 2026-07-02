import Link from "next/link";
import { getDataGaps, countGaps } from "@/lib/queries/data-gaps";

// «Дыры в данных» — одно место, где видно всё незаполненное, из-за чего
// кабинет врёт. Каждая строка — ссылка туда, где дыру можно закрыть.
export const dynamic = "force-dynamic";

export default async function DataGapsPage() {
  const sections = await getDataGaps();
  const total = countGaps(sections);

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
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((s) => (
            <section
              key={s.key}
              className={`rounded-2xl border bg-white p-4 ${
                s.rows.length > 0
                  ? "border-slate-200"
                  : "border-emerald-200 dark:border-emerald-400/20"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  {s.title}
                </h2>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                    s.rows.length > 0
                      ? "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                  }`}
                >
                  {s.rows.length > 0
                    ? `${s.rows.length}${s.extra ? ` · ${s.extra}` : ""}`
                    : "✓"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{s.why}</p>

              {s.rows.length > 0 && (
                <ul className="mt-3 max-h-72 space-y-0.5 overflow-y-auto">
                  {s.rows.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={r.href}
                        className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <span className="min-w-0 truncate text-slate-900">
                          {r.title}
                        </span>
                        {r.subtitle && (
                          <span className="shrink-0 text-xs text-slate-400">
                            {r.subtitle}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
