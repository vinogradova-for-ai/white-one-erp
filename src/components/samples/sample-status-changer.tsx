"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SAMPLE_STATUS_LABELS, SAMPLE_STATUS_ORDER } from "@/lib/constants";
import { SAMPLE_TRANSITIONS } from "@/lib/status-machine/sample-statuses";
import { SampleStatus } from "@prisma/client";

export function SampleStatusChanger({
  sampleId,
  currentStatus,
}: {
  sampleId: string;
  currentStatus: SampleStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [approvedPhotoUrl, setApprovedPhotoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const allowedNext = SAMPLE_TRANSITIONS[currentStatus];

  async function move(toStatus: SampleStatus) {
    setError(null);
    const payload: Record<string, unknown> = { toStatus, comment };
    if (toStatus === "APPROVED") {
      payload.approvalComment = approvalComment;
      if (approvedPhotoUrl) payload.approvedPhotoUrl = approvedPhotoUrl;
    }
    const res = await fetch(`/api/samples/${sampleId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j?.error?.message ?? "Ошибка");
      return;
    }
    setOpen(false);
    setComment("");
    setApprovalComment("");
    setApprovedPhotoUrl("");
    startTransition(() => router.refresh());
  }

  if (currentStatus === "RETURNED") {
    return <span className="text-xs text-slate-400">Образец закрыт</span>;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        Сменить статус
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs text-slate-500">Выберите следующий статус:</p>
          <div className="mb-3 space-y-1">
            {SAMPLE_STATUS_ORDER.filter((s) => s !== currentStatus).map((s) => {
              const isAllowed = allowedNext.includes(s);
              return (
                <button
                  key={s}
                  disabled={!isAllowed}
                  onClick={() => {
                    if (s === "APPROVED") return; // для APPROVED показываем форму снизу
                    move(s);
                  }}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                    isAllowed ? "bg-slate-100 text-slate-900 hover:bg-slate-200" : "text-slate-400"
                  }`}
                >
                  {SAMPLE_STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>

          {allowedNext.includes("APPROVED") && (
            <div className="mb-3 space-y-2 border-t border-slate-200 pt-3">
              <p className="text-xs font-medium text-slate-700">Утвердить образец:</p>
              <textarea
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                placeholder="Комментарий утверждения *"
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={approvedPhotoUrl}
                onChange={(e) => setApprovedPhotoUrl(e.target.value)}
                placeholder="Ссылка на фото утверждённого образца"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                onClick={() => move("APPROVED")}
                disabled={!approvalComment.trim()}
                className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Утвердить
              </button>
            </div>
          )}

          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий (опционально)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
