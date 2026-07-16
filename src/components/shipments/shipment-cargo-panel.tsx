"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DropzonePhotos } from "@/components/common/dropzone-photos";

// Карго-накладная поставки (перенос листа «КАРГО»): номер, места, вес, итог
// к оплате, фото накладной, оплата и факт прибытия ГАЛКАМИ с датой (Алёна
// 17.07: «мест/вес важно, остальное не нужно; оплачено — галка с датой; факт
// прибытия — галка отметить приход и дату»). Детализация фрахт/страховка/
// упаковка убрана из формы — Настя вбивает итог одной цифрой.
// Редактируют те, у кого shipment.manage; остальным — показ. Живёт с телефона.
export type CargoValues = {
  cargoNumber: string;
  placesCount: string;
  weightKg: string;
  amountUsdt: string;
  cargoPaidAt: string; // YYYY-MM-DD или ""
  arrivalActualDate: string; // YYYY-MM-DD или ""
  waybillPhotoUrls: string[];
};

const inputCls =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

function num(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// «Сегодня» по МСК (сервер и Настя живут по Москве).
function todayMsk(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function ShipmentCargoPanel({
  shipmentId,
  initial,
  canManage,
  usdRubRate,
}: {
  shipmentId: string;
  initial: CargoValues;
  canManage: boolean;
  usdRubRate: string | null; // зафиксированный курс оплаты (показ)
}) {
  const router = useRouter();
  const [v, setV] = useState<CargoValues>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof CargoValues>(k: K, val: CargoValues[K]) {
    setV((p) => ({ ...p, [k]: val }));
    setSaved(false);
  }

  const totalUsd = num(v.amountUsdt);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/shipments/${shipmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error?.message ?? "Не удалось сохранить карго-данные");
      return false;
    }
    return true;
  }

  async function save() {
    setBusy(true);
    try {
      const ok = await patch({
        cargoNumber: v.cargoNumber.trim() || null,
        placesCount: v.placesCount.trim() === "" ? null : Number(v.placesCount),
        weightKg: num(v.weightKg),
        amountUsdt: totalUsd,
        // Детализация из формы убрана — итог единственный источник денег.
        freightUsd: null,
        insuranceUsd: null,
        packingFeeUsd: null,
        cargoPaidAt: v.cargoPaidAt || null,
        arrivalActualDate: v.arrivalActualDate || null,
      });
      if (ok) {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  // Фото накладной сохраняются сразу при загрузке/удалении — Насте с телефона
  // не нужно помнить про кнопку «Сохранить».
  async function onPhotosChange(urls: string[]) {
    set("waybillPhotoUrls", urls);
    await patch({ waybillPhotoUrls: urls });
    router.refresh();
  }

  const fmt = (s: string) => s || "—";

  if (!canManage) {
    const rows: Array<[string, string]> = [
      ["№ накладной", fmt(v.cargoNumber)],
      ["Мест", fmt(v.placesCount)],
      ["Вес, кг", fmt(v.weightKg)],
      ["Итого $", fmt(v.amountUsdt)],
      ["Оплата карго", v.cargoPaidAt ? `оплачено ${v.cargoPaidAt}` : "не оплачено"],
      ["Прибытие", v.arrivalActualDate ? `приехало ${v.arrivalActualDate}` : "ещё едет"],
    ];
    return (
      <div className="space-y-3 rounded-2xl bg-white p-4 dark:bg-slate-900">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map(([label, val]) => (
            <div key={label}>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
              <div className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">{val}</div>
            </div>
          ))}
        </div>
        {v.waybillPhotoUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {v.waybillPhotoUrls.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={u} href={u} target="_blank" rel="noreferrer">
                <img src={u} alt="накладная" className="h-20 w-20 rounded-lg object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  const checkRow =
    "flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 px-3 dark:border-slate-600";

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 dark:bg-slate-900">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">№ накладной карго</span>
          <input value={v.cargoNumber} onChange={(e) => set("cargoNumber", e.target.value)} placeholder="M0514-4759-47" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Мест</span>
          <input value={v.placesCount} onChange={(e) => set("placesCount", e.target.value)} inputMode="numeric" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Вес брутто, кг</span>
          <input value={v.weightKg} onChange={(e) => set("weightKg", e.target.value)} inputMode="decimal" className={inputCls} />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Итого к оплате, $</span>
          <input value={v.amountUsdt} onChange={(e) => set("amountUsdt", e.target.value)} inputMode="decimal" className={inputCls} />
        </label>

        {/* Оплачено — галка; дата появляется с галкой (дефолт сегодня) */}
        <div className="block">
          <span className="mb-1 block text-xs text-slate-500">Оплата карго</span>
          <div className={checkRow}>
            <input
              id="paid-check"
              type="checkbox"
              checked={v.cargoPaidAt !== ""}
              onChange={(e) => set("cargoPaidAt", e.target.checked ? todayMsk() : "")}
              className="h-5 w-5 accent-slate-900 dark:accent-slate-100"
            />
            <label htmlFor="paid-check" className="text-sm text-slate-700 dark:text-slate-300">
              оплачено
            </label>
            {v.cargoPaidAt !== "" && (
              <input
                type="date"
                value={v.cargoPaidAt}
                onChange={(e) => set("cargoPaidAt", e.target.value)}
                className="ml-auto h-8 rounded border border-slate-200 bg-transparent px-1.5 text-sm dark:border-slate-600 dark:text-slate-100"
              />
            )}
          </div>
        </div>

        {/* Приход — галка; дата появляется с галкой (дефолт сегодня) */}
        <div className="block">
          <span className="mb-1 block text-xs text-slate-500">Прибытие в Москву</span>
          <div className={checkRow}>
            <input
              id="arrived-check"
              type="checkbox"
              checked={v.arrivalActualDate !== ""}
              onChange={(e) => set("arrivalActualDate", e.target.checked ? todayMsk() : "")}
              className="h-5 w-5 accent-slate-900 dark:accent-slate-100"
            />
            <label htmlFor="arrived-check" className="text-sm text-slate-700 dark:text-slate-300">
              приехало
            </label>
            {v.arrivalActualDate !== "" && (
              <input
                type="date"
                value={v.arrivalActualDate}
                onChange={(e) => set("arrivalActualDate", e.target.value)}
                className="ml-auto h-8 rounded border border-slate-200 bg-transparent px-1.5 text-sm dark:border-slate-600 dark:text-slate-100"
              />
            )}
          </div>
        </div>
      </div>

      <div>
        <span className="mb-1 block text-xs text-slate-500">Накладная (фото/скрины)</span>
        <DropzonePhotos value={v.waybillPhotoUrls} onChange={onPhotosChange} hint="Фото сохраняются сразу — кнопка не нужна." />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? "Сохраняю…" : "Сохранить карго"}
        </button>
        {saved && <span className="text-sm text-emerald-700 dark:text-emerald-300">Сохранено ✓</span>}
        {v.cargoPaidAt && usdRubRate ? (
          <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
            курс зафиксирован оплатой: {usdRubRate} ₽/$
          </span>
        ) : v.cargoPaidAt ? (
          <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
            курс оплаты зафиксируется после «Сохранить карго»
          </span>
        ) : totalUsd != null ? (
          <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
            не оплачено — раскидка по курсу на сегодня, предварительная
          </span>
        ) : null}
      </div>
    </div>
  );
}
