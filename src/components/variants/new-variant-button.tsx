"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ModelOption = { id: string; name: string };

export function NewVariantButton({ models }: { models: ModelOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = query
    ? models.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
    : models;

  function pick(id: string) {
    setOpen(false);
    router.push(`/models/${id}/variants/new`);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 shrink-0 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 active:bg-slate-800"
      >
        + Создать
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 max-h-[70vh] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-200 p-2">
            <div className="mb-1.5 px-1 text-xs text-slate-500">Сначала выберите фасон:</div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию фасона…"
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            />
          </div>
          <div className="max-h-80 overflow-auto">
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m.id)}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                {m.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-slate-400">Ничего не найдено</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
