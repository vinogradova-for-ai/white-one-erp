"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SAMPLE_STATUS_LABELS, SAMPLE_STATUS_COLORS, SAMPLE_STATUS_ORDER } from "@/lib/constants";
import { SAMPLE_TRANSITIONS } from "@/lib/status-machine/sample-statuses";
import { SampleStatus } from "@prisma/client";
import { StatusSheet, useSheet } from "@/components/common/status-sheet";

export function SampleStatusChanger({
  sampleId,
  currentStatus,
}: {
  sampleId: string;
  currentStatus: SampleStatus;
}) {
  const router = useRouter();
  const { open, openSheet, closeSheet } = useSheet();
  const [isPending, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [approvedPhotoUrl, setApprovedPhotoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<SampleStatus | null>(null);
  const [showApproval, setShowApproval] = useState(false);

  const allowedNext = SAMPLE_TRANSITIONS[currentStatus];

  async function move(toStatus: SampleStatus) {
    setError(null);
    setSavingStatus(toStatus);
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
    setSavingStatus(null);
    if (!res.ok) {
      const j = await res.json();
      setError(j?.error?.message ?? "Ошибка");
      return;
    }
    closeSheet();
    setComment(""); setApprovalComment(""); setApprovedPhotoUrl(""); setShowApproval(false);
    startTransition(() => router.refresh());
  }

  if (currentStatus === "RETURNED") {
    return <span className="text-xs text-slate-400">Образец закрыт</span>;
  }

  return (
    <>
      <button
        onClick={openSheet}
        disabled={isPending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        Сменить статус
      </button>

      <StatusSheet open={open} onClose={closeSheet} title="Сменить статус образца">
        <div className="space-y-3">
          <div>
            <div className="text-xs text-slate-500">Сейчас:</div>
            <span className={`inline-block rounded px-2 py-0.5 text-sm ${SAMPLE_STATUS_COLORS[currentStatus]}`}>
              {SAMPLE_STATUS_LABELS[currentStatus]}
            </span>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-600">Перевести в:</div>
            {SAMPLE_STATUS_ORDER.filter((s) => s !== currentStatus).map((s) => {
              const isAllowed = allowedNext.includes(s);
              return (
                <button
                  key={s}
                  disabled={!isAllowed || savingStatus !== null}
                  onClick={() => {
                    if (s === "APPROVED") {
                      setShowApproval(true);
                    } else {
                      move(s);
                    }
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                    isAllowed
                      ? "border-slate-200 bg-white text-slate-900 hover:border-slate-400 active:bg-slate-100"
                      : "border-slate-100 bg-slate-50 text-slate-400"
                  }`}
                >
                  <span>{SAMPLE_STATUS_LABELS[s]}</span>
                  {savingStatus === s && <span className="text-xs text-slate-500">сохраняем…</span>}
                </button>
              );
            })}
          </div>

          {showApproval && (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-medium text-emerald-900">Утвердить образец</p>
              <textarea
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                placeholder="Комментарий утверждения *"
                rows={2}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <input
                value={approvedPhotoUrl}
                onChange={(e) => setApprovedPhotoUrl(e.target.value)}
                placeholder="Ссылка на фото утверждённого образца (опционально)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => move("APPROVED")}
                disabled={!approvalComment.trim() || savingStatus !== null}
                className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingStatus === "APPROVED" ? "Сохраняем…" : "Утвердить"}
              </button>
            </div>
          )}

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий (опционально)"
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StatusSheet>
    </>
  );
}
