"use client";

import { useState } from "react";
import { PhotoThumb } from "@/components/common/photo-thumb";

export function PhotoUrlsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function addUrl() {
    setError(null);
    if (!url.trim()) return;
    try {
      new URL(url);
    } catch {
      setError("Введите корректный URL (начинается с https://)");
      return;
    }
    if (value.includes(url)) {
      setError("Такая ссылка уже есть");
      return;
    }
    onChange([...value, url]);
    setUrl("");
  }

  function removeUrl(u: string) {
    onChange(value.filter((x) => x !== u));
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://... или ссылка из Google Drive"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
        />
        <button
          type="button"
          onClick={addUrl}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Добавить
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((u) => (
            <div key={u} className="relative">
              <PhotoThumb url={u} size={80} />
              <button
                type="button"
                onClick={() => removeUrl(u)}
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600"
                title="Удалить"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Пока фотографий нет. Добавьте минимум одну для создания варианта.</p>
      )}
    </div>
  );
}
