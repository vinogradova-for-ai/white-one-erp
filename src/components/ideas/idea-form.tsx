"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TagInput } from "@/components/common/tag-input";
import { DEFAULT_TAGS, IDEA_PRIORITY_LABELS } from "@/lib/constants";
import { IdeaPriority } from "@prisma/client";

export function IdeaForm({ existingTags }: { existingTags: string[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    tags: [] as string[],
    priority: "MEDIUM" as IdeaPriority,
  });

  const tagSuggestions = Array.from(new Set([...existingTags, ...DEFAULT_TAGS]));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Ошибка");
        return;
      }
      router.push("/ideas");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm text-slate-700">Название идеи *</span>
        <input
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          placeholder="Пальто-пиджак укороченный"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-slate-700">Описание</span>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          placeholder="Коротко — что это и чем отличается"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-slate-700">Приоритет</span>
        <select
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value as IdeaPriority })}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {Object.entries(IDEA_PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-slate-700">Теги</span>
        <TagInput
          value={form.tags}
          onChange={(tags) => setForm({ ...form, tags })}
          suggestions={tagSuggestions}
        />
      </label>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
          Отмена
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Сохранение…" : "Добавить идею"}
        </button>
      </div>
    </form>
  );
}
