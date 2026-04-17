"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QcDefectCategory } from "@prisma/client";
import { QC_DEFECT_LABELS } from "@/lib/constants";

export function OrderQcForm({
  orderId,
  initial,
}: {
  orderId: string;
  initial: {
    qcDate: Date | null;
    qcQuantityOk: number | null;
    qcQuantityDefects: number | null;
    qcDefectsPhotoUrl: string | null;
    qcDefectCategory: QcDefectCategory | null;
    qcReplacedByFactory: boolean;
    qcResolutionNote: string | null;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    qcDate: initial.qcDate ? new Date(initial.qcDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    qcQuantityOk: initial.qcQuantityOk?.toString() ?? "",
    qcQuantityDefects: initial.qcQuantityDefects?.toString() ?? "",
    qcDefectsPhotoUrl: initial.qcDefectsPhotoUrl ?? "",
    qcDefectCategory: initial.qcDefectCategory ?? "",
    qcReplacedByFactory: initial.qcReplacedByFactory,
    qcResolutionNote: initial.qcResolutionNote ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qcDate: form.qcDate,
          qcQuantityOk: form.qcQuantityOk ? Number(form.qcQuantityOk) : null,
          qcQuantityDefects: form.qcQuantityDefects ? Number(form.qcQuantityDefects) : null,
          qcDefectsPhotoUrl: form.qcDefectsPhotoUrl || null,
          qcDefectCategory: form.qcDefectCategory || null,
          qcReplacedByFactory: form.qcReplacedByFactory,
          qcResolutionNote: form.qcResolutionNote || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось сохранить");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const hasDefects = Number(form.qcQuantityDefects) > 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Дата ОТК">
          <input
            type="date"
            value={form.qcDate}
            onChange={(e) => setForm({ ...form, qcDate: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Принято (ОК)">
          <input
            type="number"
            min={0}
            value={form.qcQuantityOk}
            onChange={(e) => setForm({ ...form, qcQuantityOk: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Брак">
          <input
            type="number"
            min={0}
            value={form.qcQuantityDefects}
            onChange={(e) => setForm({ ...form, qcQuantityDefects: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>

      {hasDefects && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Категория брака">
              <select
                value={form.qcDefectCategory}
                onChange={(e) => setForm({ ...form, qcDefectCategory: e.target.value as QcDefectCategory | "" })}
                className={inputCls}
              >
                <option value="">— выберите —</option>
                {Object.entries(QC_DEFECT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Фабрика заменила">
              <label className="flex items-center gap-2 px-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.qcReplacedByFactory}
                  onChange={(e) => setForm({ ...form, qcReplacedByFactory: e.target.checked })}
                  className="h-4 w-4"
                />
                <span>Да, заменено за счёт фабрики</span>
              </label>
            </Field>
          </div>

          <Field label="Ссылка на фото брака">
            <input
              type="url"
              value={form.qcDefectsPhotoUrl}
              onChange={(e) => setForm({ ...form, qcDefectsPhotoUrl: e.target.value })}
              placeholder="https://drive.google.com/..."
              className={inputCls}
            />
          </Field>

          <Field label="Решение по браку">
            <textarea
              value={form.qcResolutionNote}
              onChange={(e) => setForm({ ...form, qcResolutionNote: e.target.value })}
              rows={2}
              placeholder="Как решили (заменили, вернули, пустили со скидкой и т.д.)"
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Сохранение…" : "Сохранить ОТК"}
      </button>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-600">{label}</span>
      {children}
    </label>
  );
}
