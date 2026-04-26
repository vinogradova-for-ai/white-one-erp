"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type FactoryRow = {
  id: string;
  name: string;
  country: string;
  city: string | null;
  contactName: string | null;
  contactInfo: string | null;
  capacityPerMonth: number | null;
  notes: string | null;
  isActive: boolean;
  usedByOrders: number;
  usedByModels: number;
};

type FormState = {
  name: string;
  country: string;
  city: string;
  contactName: string;
  contactInfo: string;
  capacityPerMonth: string;
  notes: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  country: "",
  city: "",
  contactName: "",
  contactInfo: "",
  capacityPerMonth: "",
  notes: "",
  isActive: true,
};

const COUNTRY_SUGGESTIONS = ["Россия", "Китай", "Кыргызстан", "Вьетнам", "Турция", "Индия", "Бангладеш"];

export function FactoriesAdmin({ initialFactories }: { initialFactories: FactoryRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function openEdit(f: FactoryRow) {
    setEditingId(f.id);
    setForm({
      name: f.name,
      country: f.country,
      city: f.city ?? "",
      contactName: f.contactName ?? "",
      contactInfo: f.contactInfo ?? "",
      capacityPerMonth: f.capacityPerMonth != null ? String(f.capacityPerMonth) : "",
      notes: f.notes ?? "",
      isActive: f.isActive,
    });
    setError(null);
    setShowForm(true);
  }

  function cancel() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const capacity = form.capacityPerMonth.trim();
    const payload = {
      name: form.name.trim(),
      country: form.country.trim(),
      city: form.city.trim() || null,
      contactName: form.contactName.trim() || null,
      contactInfo: form.contactInfo.trim() || null,
      capacityPerMonth: capacity ? Number(capacity) : null,
      notes: form.notes.trim() || null,
      isActive: form.isActive,
    };

    try {
      const url = editingId ? `/api/factories/${editingId}` : "/api/factories";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Не удалось сохранить");
        return;
      }
      cancel();
      router.refresh();
    } catch {
      setError("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(f: FactoryRow) {
    const res = await fetch(`/api/factories/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !f.isActive }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      alert(j?.error?.message ?? "Не удалось изменить статус");
      return;
    }
    router.refresh();
  }

  async function remove(f: FactoryRow) {
    if (!confirm(`Удалить фабрику «${f.name}»? Это действие нельзя отменить.`)) return;

    const res = await fetch(`/api/factories/${f.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      alert(j?.error?.message ?? "Не удалось удалить");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!showForm && (
        <button
          onClick={openCreate}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Добавить фабрику
        </button>
      )}

      {showForm && (
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            {editingId ? "Редактировать фабрику" : "Новая фабрика"}
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">Название *</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Фабрика Гуанчжоу №1"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">Страна *</span>
              <input
                required
                list="factory-country-list"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Китай"
              />
              <datalist id="factory-country-list">
                {COUNTRY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">Город</span>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Гуанчжоу"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">Мощность в месяц (шт)</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.capacityPerMonth}
                onChange={(e) =>
                  setForm({ ...form, capacityPerMonth: e.target.value.replace(/\D/g, "") })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="5000"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">Контактное лицо</span>
              <input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Мистер Ван"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">Контакт (телефон / WeChat / email)</span>
              <input
                value={form.contactInfo}
                onChange={(e) => setForm({ ...form, contactInfo: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="+86 ... / wechat-id"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Заметки</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Специализация, комментарии, ограничения"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-700">Активна (показывать в списках для выбора)</span>
          </label>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={cancel}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Сохранение…" : editingId ? "Сохранить" : "Добавить"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Название</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Страна / Город</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Контакт</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Мощность</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Используется</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialFactories.map((f) => {
              const usedCount = f.usedByOrders + f.usedByModels;
              const canDelete = usedCount === 0;
              return (
                <tr key={f.id} className={f.isActive ? "" : "bg-slate-50 text-slate-500"}>
                  <td className="px-3 py-2 font-medium">{f.name}</td>
                  <td className="px-3 py-2 text-xs">
                    {f.country}
                    {f.city ? `, ${f.city}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {f.contactName && <div>{f.contactName}</div>}
                    {f.contactInfo && <div className="text-slate-400">{f.contactInfo}</div>}
                    {!f.contactName && !f.contactInfo && <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {f.capacityPerMonth != null ? f.capacityPerMonth.toLocaleString("ru-RU") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {usedCount > 0 ? (
                      <span className="text-slate-700">
                        {f.usedByOrders} зак. · {f.usedByModels} фас.
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {f.isActive ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">Активна</span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500">В архиве</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(f)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => toggleActive(f)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                        title={f.isActive ? "Убрать из списков выбора, данные не теряются" : "Снова показывать в списках"}
                      >
                        {f.isActive ? "В архив" : "Вернуть"}
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => remove(f)}
                          className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {initialFactories.length === 0 && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-sm text-slate-500">
                  Фабрик пока нет. Нажмите «+ Добавить фабрику», чтобы создать первую.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Фабрики, которые используются в заказах или фасонах, удалить нельзя — только отправить в архив.
        Архивная фабрика перестаёт показываться в списках выбора, но её история остаётся в старых заказах.
      </p>
    </div>
  );
}
