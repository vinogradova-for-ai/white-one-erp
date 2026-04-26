"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as Theme | null) ?? "light";
    setTheme(saved);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  // До монтирования — нейтральная кнопка, чтобы не мигало
  if (!mounted) {
    return <div className="h-8 w-8" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "dark" ? "Светлая тема" : "Ночной режим"}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
    >
      {theme === "dark" ? "☀" : "🌙"}
    </button>
  );
}
