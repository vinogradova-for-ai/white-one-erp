"use client";

import { useRef, useState } from "react";
import { PhotoThumb } from "@/components/common/photo-thumb";

/**
 * Универсальная зона для фото: drag-n-drop + клик для выбора с компьютера.
 * Внешние ссылки не поддерживаем — только реальная загрузка файлов.
 */
export function DropzonePhotos({
  value,
  onChange,
  hint,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Сжимаем картинку прямо в браузере перед загрузкой:
  // ресайз до 1600px, JPEG quality 0.82, авто-поворот по EXIF (createImageBitmap делает сам).
  // HEIC/HEIF/GIF/SVG не трогаем — браузер их не декодит как canvas.
  async function compressInBrowser(file: File): Promise<File> {
    if (typeof window === "undefined" || !("createImageBitmap" in window)) return file;
    if (!file.type.startsWith("image/")) return file;
    const skip = ["image/heic", "image/heif", "image/gif", "image/svg+xml"];
    if (skip.includes(file.type)) return file;

    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const maxSide = 1600;
      const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * ratio);
      const h = Math.round(bitmap.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.82),
      );
      bitmap.close();
      if (!blob) return file;
      // если сжатая больше оригинала — оставляем оригинал
      if (blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
    } catch {
      return file;
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f && f.size > 0);
    if (list.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const compressed = await Promise.all(list.map(compressInBrowser));
      const fd = new FormData();
      for (const f of compressed) fd.append("file", f);
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
