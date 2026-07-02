"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { completeChecklistTask } from "./actions";
import type { ChecklistTask, TaskUrgency } from "@/lib/queries/main-screen-checklist";

/**
 * Строка чек-листа с чек-боксом «выполнено».
 *
 * Поведение (Алёна, 27.05.2026):
 *   1. Тык на чек-бокс → задача зачёркивается, появляется inline-выбор даты
 *      «когда фактически случилось»: [Сегодня] [Вчера] [-2 дн] [-3 дн] +
 *      «-N дн» если N>3 и задача давно просрочена (динамически).
 *   2. Жмём кнопку даты → server action обновляет реальные поля в БД (см.
 *      actions.ts). Задача мгновенно зачёркнута + «✓ сделано», через
 *      revalidatePath исчезает на следующем рендере.
 *   3. Кнопка «Отмена» — снять галку без сохранения.
 *
 * Кликабельных задач без чек-бокса (order-sample, start-production, pkg-launch
 * и т.п.) этот компонент не касается — для них в page.tsx используется обычный
 * ChecklistRow со ссылкой.
 */

type ServerKind =
  | "order-qc"
  | "accept-qc"
  | "check-delivery"
  | "size-chart"
  | "approve-sample"
  | "pkg-check-delivery";

function isoToday(): string {
  const d = new Date();
  // МСК
  const msk = new Date(d.getTime() + 3 * 60 * 60_000);
  return msk.toISOString().slice(0, 10);
}

function isoMinusDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  const msk = new Date(d.getTime() + 3 * 60 * 60_000);
  return msk.toISOString().slice(0, 10);
}

function formatDM(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

export function CheckableRow({ task, ageBorder }: { task: ChecklistTask; ageBorder: string }) {
  const [picking, setPicking] = useState(false);
  const [done, setDone] = useState(false);
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Извлекаем entityId из task.id формата `${kind}:${entityId}`
  const entityId = task.id.includes(":") ? task.id.slice(task.id.indexOf(":") + 1) : task.id;

  function onCheckChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setPicking(true);
    } else {
      setPicking(false);
      setError(null);
    }
  }

  function commit(dateIso: string, label: string) {
    startTransition(async () => {
      setError(null);
      const r = await completeChecklistTask(task.kind as ServerKind, entityId, dateIso);
      if (!r.ok) {
        setError(r.error ?? "Не получилось");
        return;
      }
      setPicking(false);
      setDone(true);
      setDoneLabel(label);
    });
  }

  // Динамическая кнопка «-N дн» если задача давно просрочена (overdue > 3 дн).
  const overdueDays = task.daysToDeadline !== null && task.daysToDeadline < 0
    ? Math.abs(task.daysToDeadline)
    : 0;
  const showExtraDays = overdueDays > 3 ? overdueDays : null;

  return (
    <li className={ageBorder}>
      <div
        className={`flex items-start gap-3 px-4 py-3 text-sm ${
          done ? "bg-emerald-50/60" : "hover:bg-slate-50"
        }`}
      >
        {/* Тач-мишень чекбокса ≥44px: сам бокс 20px, но обёртка -m-2 p-2 расширяет зону нажатия. */}
        <label className="-m-2 -mt-1.5 inline-flex shrink-0 cursor-pointer select-none p-2">
          <input
            type="checkbox"
            checked={picking || done}
            disabled={pending || done}
            onChange={onCheckChange}
            className="h-5 w-5 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
            aria-label="Отметить задачу выполненной"
          />
        </label>

        <div className="min-w-0 flex-1">
          {done ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 line-through">{task.text}</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                ✓ {doneLabel}
              </span>
            </div>
          ) : picking ? (
            <div className="space-y-2">
              <div className={`${pending ? "opacity-50" : ""} text-slate-700 line-through`}>
                {task.text}
              </div>
              <DatePicker
                onPick={commit}
                onCancel={() => { setPicking(false); setError(null); }}
                pending={pending}
                extraDaysAgo={showExtraDays}
                overdueLabel={overdueDays > 0 ? `просрочено на ${overdueDays} дн` : null}
              />
              {error && <div className="text-xs text-red-600">{error}</div>}
            </div>
          ) : (
            <Link
              href={task.href}
              className={`block ${
                task.urgency === "overdue" ? "font-medium text-red-700" : "text-slate-800"
              }`}
            >
              {task.text}
            </Link>
          )}
        </div>

        {!done && !picking && <UrgencyDot urgency={task.urgency} />}
      </div>
    </li>
  );
}

function DatePicker({
  onPick,
  onCancel,
  pending,
  extraDaysAgo,
  overdueLabel,
}: {
  onPick: (iso: string, label: string) => void;
  onCancel: () => void;
  pending: boolean;
  extraDaysAgo: number | null;
  overdueLabel: string | null;
}) {
  const today = isoToday();
  const buttons: Array<{ label: string; iso: string; emphasis?: boolean }> = [
    { label: "Сегодня", iso: today, emphasis: true },
    { label: "Вчера", iso: isoMinusDays(1) },
    { label: "−2 дн", iso: isoMinusDays(2) },
    { label: "−3 дн", iso: isoMinusDays(3) },
  ];
  if (extraDaysAgo !== null && extraDaysAgo > 0) {
    buttons.push({ label: `−${extraDaysAgo} дн (по плану)`, iso: isoMinusDays(extraDaysAgo) });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 text-xs text-slate-500">
        <span>Когда фактически?</span>
        {overdueLabel && <span className="text-red-600">{overdueLabel}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {buttons.map((b) => (
          <button
            key={b.iso + b.label}
            type="button"
            disabled={pending}
            onClick={() => onPick(b.iso, `${b.label} (${formatDM(b.iso)})`)}
            className={`inline-flex min-h-[44px] items-center rounded-lg border px-3 text-xs disabled:opacity-50 ${
              b.emphasis
                ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-transparent px-3 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

function UrgencyDot({ urgency }: { urgency: TaskUrgency }) {
  const cls =
    urgency === "overdue"
      ? "bg-red-500"
      : urgency === "soon"
      ? "bg-amber-400"
      : urgency === "this-week"
      ? "bg-slate-300"
      : urgency === "next-week"
      ? "bg-slate-200"
      : "bg-slate-200";
  return <span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} aria-hidden />;
}
