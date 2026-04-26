"use client";

import { useRef, useState } from "react";
import { PhotoThumb } from "@/components/common/photo-thumb";

/**
 * Универсальная зона для фото: drag-n-drop, клик для выбора с компьютера, плюс поле для ссылки.
 * Значения хранятся в виде массива URL — локальные ("/uploads/...") и внешние работают одинаково.
 */
export function DropzonePhotos({
  value,
  onChange,
  hint,
  hideLink = false,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  hint?: string;
  hideLink?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState("");

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f && f.size > 0);
    if (list.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of list) fd.append("file", f);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось загрузить");
        return;
      }
      const { urls } = (await res.json()) as { urls: string[] };
      onChange([...value, ...urls]);
    } catch {
      setError("Не удалось загрузить");
    } finally {
      setUploading(false);
    }
  }

  function normalizeLink(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("/")) return trimmed; // локальный путь — разрешаем
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const u = new URL(withProto);
      if (!u.hostname.includes(".")) return null;
      return withProto;
    } catch {
      return null;
    }
  }

  function addLink() {
    setError(null);
    const url = normalizeLink(linkInput);
    if (!url) {
      setError("Укажите корректную ссылку или перетащите файл");
      return;
    }
    if (value.includes(url)) {
      setError("Такая ссылка уже есть");
      return;
    }
    onChange([...value, url]);
    setLinkInput("");
  }

  function remove(url: string) {
    onChange(value.filter((u) => u !== url));
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) {
            uploadFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
          dragging
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
        }`}
      >
        <div className="text-sm font-medium text-slate-700">
          {uploading ? "Загрузка…" : "Перетащите фото сюда или кликните для выбора"}
        </div>
        <div className="text-xs text-slate-500">
          JPG, PNG, WEBP, GIF, HEIC — до 10 МБ за файл. Можно сразу несколько.
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {!hideLink && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="…или вставьте ссылку (Pinterest, Google Drive, Яндекс.Диск)"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
          />
          <button
            type="button"
            onClick={addLink}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + По ссылке
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((u) => (
            <div key={u} className="relative">
              <PhotoThumb url={u} size={80} />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  remove(u);
                }}
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600"
                title="Удалить"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
