import { randomBytes } from "crypto";

// Генератор стартовых/временных паролей: 10 символов из алфавита
// без похожих знаков (нет 0/O, 1/l/i) — удобно диктовать и переписывать.
export function generateStartPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
