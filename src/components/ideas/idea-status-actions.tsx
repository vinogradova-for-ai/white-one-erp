"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IdeaStatus } from "@prisma/client";

export function IdeaStatusActions({
  ideaId,
  currentStatus,
}: {
  ideaId: string;
  currentStatus: IdeaStatus;
  title: string;
  tags: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);

  async function changeStatus(status: IdeaStatus, extra: Record<string, unknown> = {}) {
    setError(null);
    const res = await fetch(`/api/ideas/${ideaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j?.error?.message ?? "Ошибка");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Действия</h3>
      <div className="flex flex-wrap gap-2">
        {currentStatus !== "CONSIDERING" && (
          <button
            onClick={() => changeStatus("CONSIDERING")}
            disabled={isPending}
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            На рассмотрение
          </button>
        )}
        <button
          onClick={() => changeStatus("PROMOTED")}
          disabled={isPending}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Промотить в разработку →
        </button>
        {currentStatus !== "REJECTED" && (
          <button
            onClick={() => setShowReject(true)}
            disabled={isPending}
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Отклонить
          </button>
        )}
      </div>

      {showReject && (
        <div className="mt-3 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Причина отклонения *"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => changeStatus("REJECTED", { rejectedReason: reason })}
              disabled={!reason.trim() || isPending}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Отклонить
            </button>
            <button
              onClick={() => setShowReject(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
