// Утилиты которые нужны и на сервере (в page.tsx), и в client-компоненте.
// Должны быть БЕЗ "use client", иначе Next.js ругается при импорте с сервера.

export function parseCategoryParam(raw: string | undefined, valid: ReadonlyArray<string>): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => valid.includes(s));
}
