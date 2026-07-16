"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Карго-накладная поставки (перенос листа «КАРГО»): номер, места, вес, USDT,
// оплата, факт прибытия. Редактируют те, у кого shipment.manage; остальным — показ.
export type CargoValues = {
  cargoNumber: string;
  placesCount: string;
  weightKg: string;
  amountUsdt: string;
  cargoPaidAt: string; // YYYY-MM-DD или ""
  arrivalActualDate: string; // YYYY-MM-DD или ""
};

const inputCls =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export function ShipmentCargoPanel({
  shipmentId,
  initial,
  canManage,
}: {
  shipmentId: string;
  initial: CargoValues;
  canManage: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<CargoValues>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof CargoValues>(k: K, val: string) {
    setV((p) => ({ ...p, [k]: val }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cargoNumber: v.cargoNumber.trim() || null,
          placesCount: v.placesCount.trim() === "" ? null : Number(v.placesCount),
          weightKg: v.weightKg.trim() === "" ? null : Number(v.weightKg.replace(",", ".")),
          amountUsdt: v.amountUsdt.trim() === "" ? null : Number(v.amountUsdt.replace(",", ".")),
          cargoPaidAt: v.cargoPaidAt || null,
          arrivalActualDate: v.arrivalActualDate || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось сохранить карго-данные");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    // Витрина для read-only ролей — только показ, без инпутов.
    const rows: Array<[string, string]> = [
      ["№ накладной", v.cargoNumber || "—"],
      ["Мест", v.placesCount || "—"],
      ["Вес, кг", v.weightKg || "—"],
      ["Карго, USDT", v.amountUsdt || "—"],
      ["Оплата карго", v.cargoPaidAt ? `оплачено ${v.cargoPaidAt}` : "не оплачено"],
      ["Факт прибытия", v.arrivalActualDate || "—"],
    ];
    return (
      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 sm:grid-cols-3 dark:bg-slate-900">
        {rows.map(([label, val]) => (
          <div key={label}>
            <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
            <div className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">{val}</div>
          </div>
        ))}
      </div>
    );
  }

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
          <span className="mb-1 block text-xs text-slate-500">Вес, кг</span>
          <input value={v.weightKg} onChange={(e) => set("weightKg", e.target.value)} inputMode="decimal" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Карго, USDT</span>
          <input value={v.amountUsdt} onChange={(e) => set("amountUsdt", e.target.value)} inputMode="decimal" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Карго оплачено (дата)</span>
          <input type="date" value={v.cargoPaidAt} onChange={(e) => set("cargoPaidAt", e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Факт прибытия в Москву</span>
          <input type="date" value={v.arrivalActualDate} onChange={(e) => set("arrivalActualDate", e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? "Сохраняю…" : "Сохранить карго"}
        </button>
        {saved && <span className="text-sm text-emerald-700 dark:text-emerald-300">Сохранено ✓</span>}
        {!v.cargoPaidAt && v.amountUsdt && (
          <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
            карго не оплачено
          </span>
        )}
      </div>
    </div>
  );
}
