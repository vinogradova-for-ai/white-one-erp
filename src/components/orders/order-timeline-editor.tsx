"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OrderTimeline } from "@/components/orders/order-timeline";

type Timeline = {
  readyAtFactoryDate: string;
  qcDate: string;
  arrivalPlannedDate: string;
};

/**
 * Гант-таймлайн прямо на странице заказа: перетаскиваешь плашки —
 * через 800мс отправляется PATCH /api/orders/[id] с новыми датами.
 */
export function OrderTimelineEditor({
  orderId,
  launchMonth,
  initial,
}: {
  orderId: string;
  launchMonth: string;
  initial: Timeline;
}) {
  const [timeline, setTimeline] = useState<Timeline>(initial);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef<string>(JSON.stringify(initial));

  useEffect(() => {
    const cur = JSON.stringify(timeline);
    if (cur === lastSent.current) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            readyAtFactoryDate: timeline.readyAtFactoryDate || null,
            qcDate: timeline.qcDate || null,
            arrivalPlannedDate: timeline.arrivalPlannedDate || null,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          const msg = j?.error?.message ?? "Не удалось сохранить таймлайн";
          setError(msg);
          toast.error(msg);
          return;
        }
        lastSent.current = cur;
        setError(null);
        setSavedAt(new Date().toLocaleTimeString("ru-RU"));
        toast.success("Таймлайн сохранён");
      } catch {
        setError("Не удалось сохранить");
        toast.error("Не удалось сохранить таймлайн");
      }
    }, 800);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [timeline, orderId]);

  return (
    <div className="space-y-2">
      <OrderTimeline launchMonth={launchMonth} initial={timeline} onChange={setTimeline} />
      <div className="text-right text-[11px] text-slate-400">
        {error ? (
          <span className="text-red-500">{error}</span>
        ) : savedAt ? (
          <span>Сохранено в {savedAt}</span>
        ) : (
          <span>Изменения сохраняются автоматически</span>
        )}
      </div>
    </div>
  );
}
