"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CommentsThread } from "@/components/comments/comments-thread";

/**
 * Выезжающая справа панель с полной перепиской по фасону (комменты + фото).
 * Переиспользует CommentsThread (includeRelated — тянет и комменты заказов/вариантов).
 */
export function CommentsDrawer({
  modelId,
  modelName,
  currentUserId,
  isAdmin,
  onClose,
}: {
  modelId: string;
  modelName: string;
  currentUserId?: string;
  isAdmin?: boolean;
  onClose: () => void;
}) {
  // Esc закрывает
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Комментарии</div>
            <div className="truncate text-sm font-semibold text-slate-900">{modelName}</div>
          </div>
          <Link
            href={`/models/${modelId}`}
            className="rounded-lg px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
            title="Открыть фасон целиком"
          >
            Открыть фасон ↗
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-slate-100"
            title="Закрыть"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <CommentsThread
            entityType="model"
            entityId={modelId}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            includeRelated
          />
        </div>
      </div>
    </div>
  );
}
