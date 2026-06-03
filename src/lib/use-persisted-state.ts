"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * useState, который запоминает значение в localStorage.
 *
 * Зачем: фильтры/зум/выбранная вкладка на клиентских экранах (Гант, канбан,
 * список заказов) жили в обычном useState и сбрасывались при каждом заходе на
 * страницу. Сценарий Алёны: выбрала фильтр по своему имени → провалилась в заказ
 * → вернулась → всё слетело. Этот хук сохраняет состояние «по пути»: и при
 * переходе назад, и при повторном клике по пункту меню оно восстанавливается.
 *
 * SSR-safe: на сервере и в самом первом рендере отдаёт `initial` (localStorage
 * там нет) — этим избегаем hydration mismatch. Сохранённое значение подтягивается
 * после маунта в useEffect.
 *
 * Запись в localStorage происходит только через возвращаемый сеттер (когда юзер
 * реально меняет значение), поэтому первичный `initial` никогда не затирает уже
 * сохранённый выбор.
 *
 * @param key   уникальный ключ хранилища. Версионируй (`:v1`) если меняешь форму
 *              значения, иначе старый JSON может не совпасть с новой формой.
 * @param initial значение по умолчанию (когда ничего не сохранено).
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);

  // Подтянуть сохранённое один раз после маунта.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* битый JSON / приватный режим — остаёмся на initial */
    }
    // key стабилен на время жизни компонента; читаем строго один раз.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Сеттер с той же сигнатурой, что у useState (значение или updater-функция),
  // который попутно пишет результат в localStorage.
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* квота/приватный режим — не критично, состояние живёт в памяти */
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set] as const;
}
