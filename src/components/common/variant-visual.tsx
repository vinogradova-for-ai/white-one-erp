import { PhotoThumb } from "./photo-thumb";
import { colorHexFromName, isLightColor } from "@/lib/color-map";

type Props = {
  /** Свои фото цвета (если есть — берётся первое, показываем как обычное фото). */
  variantPhotoUrl: string | null | undefined;
  /** Фото фасона (используется как фоллбэк, когда у цвета своих фото нет). */
  modelPhotoUrl: string | null | undefined;
  /** Название цвета — из него подбираем цвет кружка. */
  colorName: string | null | undefined;
  /** Размер миниатюры в px. */
  size?: number;
  /** Скрыть цветной кружок (когда показываем просто своё фото цвета). */
  hideBadge?: boolean;
};

/**
 * Визуализация цветового варианта.
 * - Если у варианта есть собственное фото — показываем его.
 * - Иначе показываем фото фасона + кружок с цветом в углу.
 * - Если и фасон без фото — показываем большой кружок с цветом.
 */
export function VariantVisual({ variantPhotoUrl, modelPhotoUrl, colorName, size = 56, hideBadge = false }: Props) {
  const hex = colorHexFromName(colorName);

  // Свое фото у варианта — показываем как есть (кружок скрываем, чтобы не дублировать).
  if (variantPhotoUrl) {
    return <PhotoThumb url={variantPhotoUrl} size={size} />;
  }

  // Есть фото фасона — используем его с кружочком цвета в углу.
  if (modelPhotoUrl) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <PhotoThumb url={modelPhotoUrl} size={size} />
        {!hideBadge && <ColorDot hex={hex} colorName={colorName} size={Math.max(14, Math.round(size * 0.34))} />}
      </div>
    );
  }

  // Ни фото варианта, ни фасона — большой кружок с цветом
  const borderCls = isLightColor(hex) ? "ring-1 ring-slate-300" : "";
  return (
    <div
      className={`shrink-0 rounded-lg ${borderCls}`}
      style={{ width: size, height: size, backgroundColor: hex }}
      title={colorName ?? ""}
    />
  );
}

function ColorDot({ hex, colorName, size }: { hex: string; colorName: string | null | undefined; size: number }) {
  const light = isLightColor(hex);
  return (
    <span
      className={`absolute -bottom-1 -right-1 block rounded-full border-2 border-white shadow-sm ${light ? "ring-1 ring-slate-200" : ""}`}
      style={{ width: size, height: size, backgroundColor: hex }}
      title={colorName ?? ""}
    />
  );
}
