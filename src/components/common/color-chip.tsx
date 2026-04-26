import { colorHexFromName, isLightColor } from "@/lib/color-map";

/**
 * Маленький визуальный чип: кружок цвета + название.
 * Используется везде, где в интерфейсе фигурирует название цвета «шоколад», «беж» и т.п.
 */
export function ColorChip({
  name,
  size = 14,
  className = "",
  textClassName = "",
}: {
  name: string | null | undefined;
  size?: number;
  className?: string;
  textClassName?: string;
}) {
  if (!name) return null;
  const hex = colorHexFromName(name);
  const light = isLightColor(hex);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`inline-block shrink-0 rounded-full ${light ? "ring-1 ring-slate-300" : ""}`}
        style={{ width: size, height: size, backgroundColor: hex }}
        aria-hidden
      />
      <span className={textClassName}>{name}</span>
    </span>
  );
}
