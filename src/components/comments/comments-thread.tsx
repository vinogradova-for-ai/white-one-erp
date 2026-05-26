"use client";

import { useEffect, useState } from "react";

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
};

export function CommentsThread({
  entityType,
  entityId,
}: {
  entityType: "model" | "order";
  entityId: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    fetch(`/api/comments?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => r.json())
      .then((j) => {
        if (canceled) return;
        setComments(j.comments ?? []);
        setLoading(false);
      })
      .catch((e) => {
        if (canceled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [entityType, entityId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, body }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Ошибка");
        return;
      }
      const j = await res.json();
      // Подставляем authorName из имени из заголовка через дополнительный запрос —
      // дешевле просто перезагрузить список.
      const refresh = await fetch(
        `/api/comments?entityType=${entityType}&entityId=${entityId}`,
      ).then((r) => r.json());
      setComments(refresh.comments ?? []);
      setBody("");
      void j;
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Комментарии {comments.length > 0 && <span className="text-slate-400">{comments.length}</span>}
      </h2>

      <form onSubmit={submit} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Заметка про ткань, посадку, особенности…"
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:bg-white"
        />
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!body.trim() || posting}
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
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{c.authorName}</span>
                <span>{formatDateTime(c.createdAt)}</span>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{c.body}</div>
            </li>
          ))}
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
