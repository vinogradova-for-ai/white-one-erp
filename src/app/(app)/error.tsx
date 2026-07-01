"use client";

/**
 * Экран ошибки для всех страниц кабинета (аудит блок ④).
 * Раньше ошибка БД (например, недоступный Neon) давала голый стандартный
 * крэш-экран Next — белый экран без объяснения для непрограммистов. Теперь —
 * понятное сообщение и кнопка «Обновить» (reset() перезапускает сегмент).
 */
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // В консоль/логи — для разбора, пользователю подробности не показываем.
    console.error("Ошибка страницы кабинета:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="text-4xl">😕</div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-slate-900">Что-то пошло не так</h1>
        <p className="max-w-sm text-sm text-slate-500">
          Не удалось загрузить данные. Обычно помогает обновить страницу — если
          повторяется, попробуйте позже.
        </p>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Обновить
      </button>
    </div>
  );
}
