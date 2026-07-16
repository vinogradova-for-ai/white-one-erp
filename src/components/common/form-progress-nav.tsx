"use client";

// Прогресс-навигация длинной формы (закон UX: одна длинная форма с прогрессом
// сверху, не wizard). Sticky-строка чипов: «заполнено X из Y», клик — автоскролл
// к секции (у секций должен стоять id + scroll-mt-24).
export type FormNavSection = { id: string; title: string; filled: boolean };

export function FormProgressNav({ sections }: { sections: FormNavSection[] }) {
  const filled = sections.filter((s) => s.filled).length;
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
        <span className="shrink-0 pr-1 text-xs font-medium text-slate-500">
          Заполнено {filled} из {sections.length}
        </span>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={`inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition ${
              s.filled
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {s.filled && <span aria-hidden>✓</span>}
            {s.title}
          </button>
        ))}
      </div>
    </div>
  );
}
