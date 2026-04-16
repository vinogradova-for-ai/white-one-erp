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
  if (!url) {
    return (
      <div
        style={{ width: size, height: size }}
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
      style={{ width: size, height: size }}
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
      <div className={`flex aspect-square w-full items-center justify-center rounded-2xl bg-slate-100 text-slate-300 ${className}`}>
        <ImageIcon size={64} />
      </div>
    );
  }
  return (
    <div className={`space-y-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[0]}
        alt={alt ?? ""}
        className="aspect-square w-full rounded-2xl object-cover"
      />
      {urls.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {urls.slice(1, 5).map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={alt ?? ""}
              className="aspect-square w-full rounded-lg object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}
    </div>
  );
}
