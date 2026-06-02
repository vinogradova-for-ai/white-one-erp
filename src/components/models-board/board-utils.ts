// ── Константы ─────────────────────────────────────────────
// Карточка-превью в стиле поста Instagram: шапка (аватар+ник) + фото + панель
// действий + подпись. Фото = высота карточки минус шапка и подвал.
export const CARD_HEADER = 32; // тонкая шапка с аватаром и ником
export const CARD_FOOTER = 62; // тонкая панель лайков/коммент + подпись

// Pinterest-муд­борд палитра: мягкие десатурированные пастели.
export const STICKY_COLORS = ["#FCE7A2", "#F8C9D4", "#CFE3C5", "#BBD6E8", "#DACDEE", "#F4C9A8", "#F4EAD5", "#E2D8C8"];
export const DEFAULT_STICKY = STICKY_COLORS[0];
export const TEXT_COLORS = ["#111827", "#ffffff", "#ff3da6", "#ef4444", "#f59e0b", "#10b981", "#2563eb", "#8b5cf6"];
export const STICKY_TEXT = "#3a3733";

// Рукописные шрифты для курсивных надписей (CSS-переменные заданы в layout.tsx).
// Все поддерживают кириллицу и латиницу. fontFamily элемента хранит ключ.
export const SCRIPT_FONTS: Array<{ key: string; label: string; css: string }> = [
  { key: "vibes", label: "with love", css: "var(--font-script-vibes), cursive" },
  { key: "pacifico", label: "Pacifico", css: "var(--font-script-pacifico), cursive" },
  { key: "caveat", label: "Caveat", css: "var(--font-script-caveat), cursive" },
];
export const scriptCss = (key?: string | null): string | null =>
  key ? SCRIPT_FONTS.find((f) => f.key === key)?.css ?? null : null;
export const SCRIPT_PINK = "#ff3da6"; // фирменный розовый для курсивных надписей

// Лёгкий детерминированный наклон стикера (живой коллажный вид как в Pinterest).
export function tiltFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return ((h % 100) / 100) * 3.4 - 1.7; // ≈ [-1.7°, +1.7°]
}

// ── Карточка фасона ───────────────────────────────────────
export function igHandle(brandLabel: string): string {
  const l = brandLabel.toLowerCase();
  if (l.includes("white")) return "white_one_love";
  if (l.includes("сердц")) return "serdcebienie";
  return brandLabel.toLowerCase().replace(/\s+/g, "_") || "white_one_love";
}
