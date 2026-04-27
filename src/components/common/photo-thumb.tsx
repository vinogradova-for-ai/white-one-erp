import { ImageIcon } from "lucide-react";

/**
 * Превью-миниатюра. Если фото нет — иконка-заглушка.
 * Использует <img>, а не next/image, чтобы разрешить любые внешние URL (Google Drive, Unsplash и т.д.).
 */
export function PhotoThumb({
  url,
  alt,
  size = 48,
  className = "",
}: {
  url?: string | null;
  alt?: string;
  size?: number;
  className?: string;
}) {
  // Вертикальный формат 4:5 — стандарт фото товара на WB
  const width = size;
  const height = Math.round(size * 1.25);
  if (!url) {
    return (
      <div
        style={{ width, height }}
        className={`flex flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300 ${className}`}
      >
        <ImageIcon size={size * 0.5} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt ?? ""}
      style={{ width, height }}
      className={`flex-shrink-0 rounded-lg object-cover ${className}`}
      loading="lazy"
    />
  );
}

export function PhotoGallery({
  urls,
  alt,
  className = "",
}: {
  urls: string[];
  alt?: string;
  className?: string;
}) {
  if (urls.length === 0) {
    return (
      <div
        className={`flex h-32 w-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400 ${className}`}
      >
        <div className="flex flex-col items-center gap-1">
          <ImageIcon size={28} />
          <span>Фото ещё нет</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`space-y-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[0]}
        alt={alt ?? ""}
        className="aspect-[4/5] w-full rounded-2xl object-cover"
      />
      {urls.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {urls.slice(1, 5).map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={alt ?? ""}
              className="aspect-[4/5] w-full rounded-lg object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}
    </div>
  );
}
