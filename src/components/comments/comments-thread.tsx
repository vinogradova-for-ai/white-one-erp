"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Comment = {
  id: string;
  entityType: string;
  entityId: string;
  authorId: string;
  authorName: string;
  body: string;
  photoUrls: string[];
  createdAt: string;
  updatedAt: string | null;
  /** На странице фасона с миксованным потоком — номер заказа, к которому коммент привязан. */
  contextLabel?: string | null;
};

export function CommentsThread({
  entityType,
  entityId,
  currentUserId,
  isAdmin = false,
  /** Для фасона — подтягивает в ленту и комменты всех его заказов (с меткой). */
  includeOrders = false,
  /** Универсальная агрегация: фасон → заказы+варианты, заказ/вариант → родительский фасон. */
  includeRelated = false,
}: {
  entityType: "model" | "order" | "variant";
  entityId: string;
  currentUserId?: string;
  isAdmin?: boolean;
  includeOrders?: boolean;
  includeRelated?: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]); // уже загруженные URL'ы
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState(false);
  // Просмотр фото внутри страницы (а не в новой вкладке): какой комментарий и индекс.
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const listUrl = `/api/comments?entityType=${entityType}&entityId=${entityId}${
    includeOrders || includeRelated ? "&includeRelated=1" : ""
  }`;

  async function reload() {
    setLoading(true);
    try {
      const j = await fetch(listUrl).then((r) => r.json());
      setComments(j.comments ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, includeOrders]);

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of arr) form.append("file", f);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Ошибка загрузки");
        return;
      }
      const j = await res.json();
      setPendingPhotos((p) => [...p, ...(j.urls ?? [])]);
    } finally {
      setUploading(false);
    }
  }

  function removePending(url: string) {
    setPendingPhotos((p) => p.filter((u) => u !== url));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((!body.trim() && pendingPhotos.length === 0) || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          // Если совсем пусто — отправляем заглушку, чтобы валидатор не ругался.
          body: body.trim() || "📎",
          photoUrls: pendingPhotos,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Ошибка");
        return;
      }
      setBody("");
      setPendingPhotos([]);
      await reload();
    } finally {
      setPosting(false);
    }
  }

  async function remove(commentId: string) {
    if (!confirm("Удалить комментарий?")) return;
    const res = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      setError(j?.error?.message ?? "Не удалось удалить");
      return;
    }
    setComments((cs) => cs.filter((c) => c.id !== commentId));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropOver(false);
    if (e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files);
    }
  }

  // Paste из буфера: Алёна копирует фото со скриншота (Cmd+Shift+5 на Mac),
  // потом Cmd+V в любое место формы — улетает в /api/uploads.
  // Слушаем на самой форме чтобы paste работал даже без фокуса в textarea.
  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void uploadFiles(files);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Комментарии{" "}
        {comments.length > 0 && <span className="text-slate-400">{comments.length}</span>}
      </h2>

      <form
        onSubmit={submit}
        onDragOver={(e) => {
          e.preventDefault();
          setDropOver(true);
        }}
        onDragLeave={() => setDropOver(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={`space-y-2 rounded-2xl border-2 bg-white p-3 transition ${
          dropOver
            ? "border-dashed border-emerald-500 bg-emerald-50/60 dark:bg-emerald-400/10"
            : "border-dashed border-slate-300"
        }`}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Заметка про ткань, посадку, особенности…"
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:bg-white"
        />

        {/* Подсказка DnD — постоянно видна. Алёна (memory): «Фото всегда drag-n-drop».
            Поддерживаем три способа: дроп, paste из буфера (Cmd+V), клик 📎. */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs transition ${
            dropOver
              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300"
              : "border-slate-300 bg-slate-50 text-slate-500 hover:border-slate-400 hover:text-slate-700"
          }`}
        >
          <span className="text-base leading-none">📎</span>
          <span>
            {dropOver
              ? "Отпустите файл здесь"
              : uploading
              ? "Загружаю…"
              : "Перетащите фото, вставьте из буфера (⌘V) или нажмите"}
          </span>
        </div>

        {pendingPhotos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingPhotos.map((url) => (
              <div
                key={url}
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePending(url)}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Убрать фото"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="text-xs text-red-600 dark:text-red-300">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="submit"
            disabled={(!body.trim() && pendingPhotos.length === 0) || posting || uploading}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 text-xs font-medium text-white disabled:opacity-40 sm:min-h-0 sm:px-3 sm:py-1.5"
          >
            {posting ? "Сохраняю…" : "Добавить"}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="text-xs text-slate-500">Загрузка…</div>
      ) : comments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
          Пока нет комментариев — добавь первый
        </div>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => {
            const canDelete = isAdmin || (currentUserId && currentUserId === c.authorId);
            return (
              <li key={c.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-slate-700">{c.authorName}</span>
                    {c.contextLabel && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                        к {c.contextLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{formatDateTime(c.createdAt)}</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="text-slate-400 hover:text-red-600 dark:hover:text-red-300"
                        aria-label="Удалить"
                        title="Удалить"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                {c.body && c.body !== "📎" && (
                  <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{c.body}</div>
                )}
                {c.photoUrls.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.photoUrls.map((url, i) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setLightbox({ urls: c.photoUrls, index: i })}
                        className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200 transition hover:opacity-80"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {lightbox && (
        <Lightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onIndex={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  );
}

// Полноэкранный просмотр фото поверх всего (через портал — чтобы не обрезался
// дровером/контейнером). Клик по фону, ×, или Esc — закрыть; стрелки — листать.
function Lightbox({
  urls,
  index,
  onIndex,
  onClose,
}: {
  urls: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const multi = urls.length > 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (multi && e.key === "ArrowRight") onIndex((index + 1) % urls.length);
      else if (multi && e.key === "ArrowLeft") onIndex((index - 1 + urls.length) % urls.length);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, multi, urls.length, onIndex, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-2xl leading-none text-white transition hover:bg-white/30"
        aria-label="Закрыть"
      >
        ×
      </button>

      {multi && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + urls.length) % urls.length); }}
            className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-3xl leading-none text-white transition hover:bg-white/30"
            aria-label="Предыдущее"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % urls.length); }}
            className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-3xl leading-none text-white transition hover:bg-white/30"
            aria-label="Следующее"
          >
            ›
          </button>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-sm text-white">
            {index + 1} / {urls.length}
          </div>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
      />
    </div>,
    document.body,
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
