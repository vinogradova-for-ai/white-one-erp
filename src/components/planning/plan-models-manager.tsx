"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ModelOption = { id: string; name: string; category: string };

// Привязка фасонов к плану: селект из свободных фасонов + отвязка крестиком.
// Новый фасон под план создаётся как обычно в «Фасонах», потом привязывается здесь.
export function PlanModelsManager({
  planId,
  freeModels,
  canManage,
}: {
  planId: string;
  freeModels: ModelOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  async function change(modelId: string, attach: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/brand-plans/${planId}/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, attach }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось изменить привязку");
      } else {
        setSelected("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="h-10 min-w-56 rounded-lg border border-slate-300 bg-white px-2 text-sm"
      >
        <option value="">+ Привязать фасон к плану…</option>
        {freeModels.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {m.category}
          </option>
        ))}
      </select>
      {selected && (
        <button
          onClick={() => change(selected, true)}
          disabled={busy}
          className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "…" : "Привязать"}
        </button>
      )}
    </div>
  );
}

export function DetachModelButton({ planId, modelId }: { planId: string; modelId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      title="Отвязать от плана"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/brand-plans/${planId}/models`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelId, attach: false }),
          });
          if (res.ok) router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
    >
      ✕
    </button>
  );
}
