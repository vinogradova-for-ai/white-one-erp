"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition, useEffect, useRef } from "react";

/**
 * Универсальный фильтр для /models и /models/kanban.
 * Авто-применение: любое изменение сразу пушит новый URL без кнопки «Фильтр».
 * Категории — мульти-выбор через chips (можно выбрать несколько).
 * Бренд / Ответственный — одиночный выбор.
 * Поиск — debounce 350ms.
 */
export function ModelsFilters({
  brands,
  categories,
  owners,
  selected,
}: {
  brands: Array<{ key: string; label: string }>;
  categories: ReadonlyArray<string>;
  owners: Array<{ id: string; name: string | null }>;
  selected: {
    q: string;
    brand: string;
    categoryList: string[]; // массив, потому что мульти
    owner: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(selected.q);
  // Debounce для поиска чтобы не дёргать сервер на каждый символ
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushWith(updates: Record<string, string | string[] | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || (Array.isArray(v) ? v.length === 0 : v === "")) {
        params.delete(k);
      } else if (Array.isArray(v)) {
        params.set(k, v.join(","));
      } else {
        params.set(k, v);
      }
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  useEffect(() => {
    setQ(selected.q);
  }, [selected.q]);

  function onQChange(v: string) {
    setQ(v);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      pushWith({ q: v });
    }, 350);
  }

  function toggleCategory(c: string) {
    const has = selected.categoryList.includes(c);
    const next = has ? selected.categoryList.filter((x) => x !== c) : [...selected.categoryList, c];
    pushWith({ category: next });
  }

  function setBrand(b: string) {
    pushWith({ brand: b });
  }

  function setOwner(o: string) {
    pushWith({ owner: o });
  }

  const hasActive = q || selected.brand || selected.categoryList.length > 0 || selected.owner;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder="Поиск по названию…"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm w-44"
        />
        <select
          value={selected.brand}
          onChange={(e) => setBrand(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Все бренды</option>
          {brands.map((b) => (
            <option key={b.key} value={b.key}>{b.label}</option>
          ))}
        </select>
        <select
          value={selected.owner}
          onChange={(e) => setOwner(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Все ответственные</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>{o.name ?? "—"}</option>
          ))}
        </select>
        {hasActive && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            сбросить
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-1">Категории:</span>
        {categories.map((c) => {
          const active = selected.categoryList.includes(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggleCategory(c)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Helper: парсит ?category=A,B,C в массив
export function parseCategoryParam(raw: string | undefined, valid: ReadonlyArray<string>): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => valid.includes(s));
}
