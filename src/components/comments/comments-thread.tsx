"use client";

import { useEffect, useRef, useState } from "react";

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
}: {
  entityType: "model" | "order";
  entityId: string;
  currentUserId?: string;
  isAdmin?: boolean;
  includeOrders?: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]); // уже загруженные URL'ы
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const listUrl = `/api/comments?entityType=${entityType}&entityId=${entityId}${
    includeOrders ? "&includeOrders=1" : ""
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
        className={`space-y-2 rounded-2xl border-2 bg-white p-3 transition ${
          dropOver ? "border-dashed border-slate-400 bg-slate-50" : "border-slate-200"
        }`}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Заметка про ткань, посадку, особенности…  Можно перетащить фото сюда."
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:bg-white"
        />

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
                  className="absolute right-0.5 top-0.5 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white group-hover:flex"
                  aria-label="Убрать фото"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex items-center justify-between gap-2">
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
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {uploading ? "Загружаю…" : "📎 Фото"}
          </button>
          <button
            type="submit"
            disabled={(!body.trim() && pendingPhotos.length === 0) || posting || uploading}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
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
                        className="text-slate-400 hover:text-red-600"
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
                    {c.photoUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200 hover:opacity-80"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
