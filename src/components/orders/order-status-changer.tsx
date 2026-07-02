"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_STATUS_ORDER } from "@/lib/constants";
import { OrderStatus } from "@prisma/client";
import { StatusSheet, useSheet } from "@/components/common/status-sheet";
// Единый источник переходов — тот же, что читает бэкенд-роут /api/orders/[id]/status.
// Локальную копию убрали, чтобы UI и сервер не разъехались (см. аудит консистентности).
import { ORDER_TRANSITIONS } from "@/lib/status-machine/order-statuses";

// FABRIC_ORDERED («Ткань заказана») из UI не предлагаем как отдельный шаг (аудит п.5):
// его никто вручную не проставлял, заказы шли сразу в пошив. Из PREPARATION
// показываем прямой переход в SEWING. Статус остаётся в enum и цепи для легаси.
const HIDDEN_TARGETS: OrderStatus[] = ["FABRIC_ORDERED"];

export function OrderStatusChanger({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: OrderStatus;
}) {
  const router = useRouter();
  const { open, openSheet, closeSheet } = useSheet();
  const [isPending, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<OrderStatus | null>(null);

  const allowedNext = ORDER_TRANSITIONS[currentStatus];
  // Для «На складе Москва» спрашиваем дату прибытия (Сегодня/Вчера/…):
  // без неё факт прибытия = момент клика, а Настя часто отмечает на 1-2 дня позже.
  const [askArrivalDate, setAskArrivalDate] = useState(false);

  async function move(toStatus: OrderStatus, dateIso?: string) {
    setError(null);
    setSavingStatus(toStatus);
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStatus, comment, ...(dateIso ? { dateIso } : {}) }),
    });
    setSavingStatus(null);
    if (!res.ok) {
      const j = await res.json();
      const msg = j?.error?.message ?? "Ошибка";
      setError(msg);
      toast.error(`Статус: ${msg}`);
      return;
    }
    toast.success(`Статус → ${ORDER_STATUS_LABELS[toStatus]}`);
    closeSheet();
    setComment("");
    setAskArrivalDate(false);
    startTransition(() => router.refresh());
  }

  // Дата по МСК N дней назад в формате YYYY-MM-DD.
  function mskDaysAgoIso(n: number): string {
    const msk = new Date(Date.now() + 3 * 60 * 60_000 - n * 86_400_000);
    return msk.toISOString().slice(0, 10);
  }

  if (currentStatus === "ON_SALE") {
    return <span className="text-xs text-slate-400">В продаже</span>;
  }

  return (
    <>
      <button
        onClick={openSheet}
        disabled={isPending}
        className="flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        Сменить статус
      </button>

      <StatusSheet open={open} onClose={closeSheet} title="Сменить статус заказа">
        <div className="space-y-3">
          <div>
            <div className="text-xs text-slate-500">Сейчас:</div>
            <span className={`inline-block rounded px-2 py-0.5 text-sm ${ORDER_STATUS_COLORS[currentStatus]}`}>
              {ORDER_STATUS_LABELS[currentStatus]}
            </span>
          </div>

          {askArrivalDate ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-600">
                Когда заказ приехал на склад?
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: "Сегодня", n: 0 },
                  { label: "Вчера", n: 1 },
                  { label: "−2 дн", n: 2 },
                  { label: "−3 дн", n: 3 },
                ].map((opt) => (
                  <button
                    key={opt.n}
                    disabled={savingStatus !== null}
                    onClick={() => move("WAREHOUSE_MSK", mskDaysAgoIso(opt.n))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition hover:border-slate-400 active:bg-slate-100 disabled:opacity-50"
                  >
                    {opt.label}
                  </button>
                ))}
                <input
                  type="date"
                  max={mskDaysAgoIso(0)}
                  disabled={savingStatus !== null}
                  onChange={(e) => {
                    if (e.target.value) move("WAREHOUSE_MSK", e.target.value);
                  }}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900"
                  aria-label="Другая дата прибытия"
                />
                <button
                  onClick={() => setAskArrivalDate(false)}
                  disabled={savingStatus !== null}
                  className="px-2 py-2 text-sm text-slate-500 hover:text-slate-700"
                >
                  Отмена
                </button>
              </div>
              {savingStatus !== null && (
                <div className="text-xs text-slate-500">сохраняем…</div>
              )}
            </div>
          ) : (
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-600">Перевести в:</div>
            {ORDER_STATUS_ORDER.filter(
              (s) => s !== currentStatus && !HIDDEN_TARGETS.includes(s),
            ).map((s) => {
              const isAllowed = allowedNext.includes(s);
              return (
                <button
                  key={s}
                  disabled={!isAllowed || savingStatus !== null}
                  onClick={() => (s === "WAREHOUSE_MSK" ? setAskArrivalDate(true) : move(s))}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                    isAllowed
                      ? "border-slate-200 bg-white text-slate-900 hover:border-slate-400 active:bg-slate-100"
                      : "border-slate-100 bg-slate-50 text-slate-400"
                  }`}
                >
                  <span>{ORDER_STATUS_LABELS[s]}</span>
                  {savingStatus === s && <span className="text-xs text-slate-500">сохраняем…</span>}
                  {isAllowed && savingStatus !== s && <span className="text-slate-400">→</span>}
                </button>
              );
            })}
          </div>
          )}

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий (опционально)"
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StatusSheet>
    </>
  );
}
