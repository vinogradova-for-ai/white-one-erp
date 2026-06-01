import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Юнит-тесты на чистую доменную логику (деньги, даты, статусы).
// Не трогают БД и сеть — только pure-функции из src/lib.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
