"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function PaymentRowActions({ id, status }: { id: string; status: "PENDING" | "PAID" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // §4 UX-аудита: удаление спрятано в «⋯»-меню — раньше «×» стоял вплотную
  // к «Оплачен», мисклик = необратимое удаление платежа.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  async function markPaid() {
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/${id}/mark-paid`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось отметить оплаченным");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function unmarkPaid() {
    if (!confirm("Откатить платёж в статус «Ждёт»?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/${id}/mark-paid`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось откатить");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Удалить платёж? Действие необратимо.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось удалить");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {status === "PENDING" ? (
        <button
          onClick={markPaid}
          disabled={busy}
          className="inline-flex min-h-[40px] items-center rounded-lg bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Оплачен
        </button>
      ) : (
        <button
          onClick={unmarkPaid}
          disabled={busy}
          className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Откатить
        </button>
      )}
      <Link
        href={`/payments/${id}/edit`}
        className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50"
      >
        Править
      </Link>
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy}
          aria-label="Ещё действия"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-base text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <button
              onClick={() => {
                setMenuOpen(false);
                remove();
              }}
              className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10"
            >
              Удалить платёж
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
