"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PhotoThumb } from "@/components/common/photo-thumb";

// Образцы фасона: заказан → едет → получен → вердикт (ок / на доработку).
// Итерация доработки = новый образец (история остаётся записями).

export type SampleView = {
  id: string;
  label: string | null;
  status: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "APPROVED" | "REWORK";
  orderedDate: string | null;
  receivedDate: string | null;
  verdictDate: string | null;
  verdictNote: string | null;
  photoUrls: string[];
  factoryName: string | null;
};

const STATUS_LABELS: Record<SampleView["status"], string> = {
  ORDERED: "Заказан",
  IN_TRANSIT: "Едет",
  RECEIVED: "Получен",
  APPROVED: "Утверждён",
  REWORK: "На доработку",
};

const STATUS_CHIPS: Record<SampleView["status"], string> = {
  ORDERED: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
  IN_TRANSIT: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
  RECEIVED: "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
  APPROVED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  REWORK: "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300",
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export function SamplesSection({
  modelId,
  samples,
  isAdmin,
}: {
  modelId: string;
  samples: SampleView[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function createSample() {
    setBusy(true);
    try {
      const res = await fetch(`/api/models/${modelId}/samples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error?.message ?? "Не удалось заказать образец");
        return;
      }
      toast.success("Образец заказан");
      setLabel("");
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Образцы{samples.length > 0 && <span className="ml-1 text-slate-400">({samples.length})</span>}
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Заказать образец
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && createSample()}
            placeholder="Что за образец: «44 размер, лён», «2-я итерация»…"
            className="h-10 min-w-64 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          />
          <button
            type="button"
            onClick={createSample}
            disabled={busy}
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "…" : "Заказать"}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="h-10 px-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Отмена
          </button>
        </div>
      )}

      {samples.length === 0 && !adding ? (
        <p className="mt-3 text-sm text-slate-400">
          Образцов ещё нет. Закажи первый — статусы и даты будут видны здесь и в задачах.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {samples.map((s) => (
            <SampleRow key={s.id} sample={s} isAdmin={isAdmin} onChanged={() => router.refresh()} />
          ))}
        </div>
      )}
    </section>
  );
}

function SampleRow({
  sample,
  isAdmin,
  onChanged,
}: {
  sample: SampleView;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Вердикт: клик по «Ок»/«На доработку» открывает поле заметки + подтверждение.
  const [verdictFor, setVerdictFor] = useState<"APPROVED" | "REWORK" | null>(null);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function patch(body: Record<string, unknown>, okMessage: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/samples/${sample.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error?.message ?? "Ошибка");
        return;
      }
      toast.success(okMessage);
      setVerdictFor(null);
      setNote("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhotos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    setBusy(true);
    try {
      const form = new FormData();
      for (const f of arr) form.append("file", f);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (!res.ok) {
        toast.error("Не удалось загрузить фото");
        return;
      }
      const j = await res.json();
      await patch({ photoUrls: [...sample.photoUrls, ...(j.urls ?? [])] }, "Фото добавлены");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Удалить образец?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/samples/${sample.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error?.message ?? "Не удалось удалить");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const dates = [
    sample.orderedDate && `заказан ${fmtDate(sample.orderedDate)}`,
    sample.receivedDate && `получен ${fmtDate(sample.receivedDate)}`,
    sample.verdictDate && `вердикт ${fmtDate(sample.verdictDate)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`rounded-xl border p-3 transition ${
        dragOver ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        uploadPhotos(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CHIPS[sample.status]}`}>
          {STATUS_LABELS[sample.status]}
        </span>
        <span className="text-sm font-medium text-slate-900">
          {sample.label ?? "Образец"}
        </span>
        {sample.factoryName && (
          <span className="text-xs text-slate-400">{sample.factoryName}</span>
        )}
        <span className="ml-auto text-xs text-slate-400">{dates}</span>
        {isAdmin && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label="Удалить образец"
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-400/10 dark:hover:text-red-300 disabled:opacity-30"
          >
            ✕
          </button>
        )}
      </div>

      {sample.verdictNote && (
        <p className="mt-1.5 text-sm text-slate-600">{sample.verdictNote}</p>
      )}

      {(sample.photoUrls.length > 0 || true) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {sample.photoUrls.map((url) => (
            <PhotoThumb key={url} url={url} size={56} />
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Добавить фото: клик или перетащи файлы на карточку образца"
            className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 text-lg text-slate-400 hover:border-slate-400 hover:text-slate-600 disabled:opacity-40"
          >
            📎
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) uploadPhotos(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* Действия по статусу */}
      {verdictFor ? (
        <div className="mt-2 space-y-2">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              verdictFor === "APPROVED"
                ? "Комментарий (опционально): что понравилось, что учесть в тираже…"
                : "Что доработать: посадка, ткань, фурнитура…"
            }
            rows={2}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                patch(
                  { status: verdictFor, verdictNote: note.trim() || null },
                  verdictFor === "APPROVED" ? "Образец утверждён" : "Отправлен на доработку",
                )
              }
              className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                verdictFor === "APPROVED"
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-red-600 hover:bg-red-500"
              }`}
            >
              {verdictFor === "APPROVED" ? "Подтвердить: ок" : "Подтвердить: на доработку"}
            </button>
            <button
              type="button"
              onClick={() => setVerdictFor(null)}
              className="px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {sample.status === "ORDERED" && (
            <>
              <ActionButton busy={busy} onClick={() => patch({ status: "IN_TRANSIT" }, "Образец едет")}>
                Едет →
              </ActionButton>
              <ActionButton busy={busy} onClick={() => patch({ status: "RECEIVED" }, "Образец получен")}>
                Получен →
              </ActionButton>
            </>
          )}
          {sample.status === "IN_TRANSIT" && (
            <ActionButton busy={busy} onClick={() => patch({ status: "RECEIVED" }, "Образец получен")}>
              Получен →
            </ActionButton>
          )}
          {sample.status === "RECEIVED" && (
            <>
              <ActionButton busy={busy} onClick={() => setVerdictFor("APPROVED")}>
                ✓ Ок
              </ActionButton>
              <ActionButton busy={busy} onClick={() => setVerdictFor("REWORK")}>
                На доработку
              </ActionButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  busy,
  onClick,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 transition hover:border-slate-400 active:bg-slate-100 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
