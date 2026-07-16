"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePersistedState } from "@/lib/use-persisted-state";

// Табы «По датам / По фабрикам» для вкладки «Предстоящие» (топ-12 UX-аудита).
// Выбор запоминается: заход без параметра ?group= подхватывает сохранённый вид.
export function ListGroupTabs({
  current,
  typeParam,
  hasExplicitParam,
}: {
  current: "date" | "factory";
  typeParam: string | null;
  hasExplicitParam: boolean;
}) {
  const router = useRouter();
  const [stored, setStored] = usePersistedState<"date" | "factory">("payments:list-group:v1", "date");
  const restored = useRef(false);

  // Восстановление сохранённого вида — один раз, только если в URL нет ?group=.
  useEffect(() => {
    if (restored.current || hasExplicitParam) return;
    restored.current = true;
    if (stored !== current) {
      router.replace(buildHref(stored, typeParam));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  function buildHref(group: "date" | "factory", type: string | null) {
    const params = new URLSearchParams({ view: "list", group });
    if (type) params.set("type", type);
    return `/payments?${params.toString()}`;
  }

  function pick(group: "date" | "factory") {
    setStored(group);
    restored.current = true;
    router.push(buildHref(group, typeParam));
  }

  return (
    <div className="flex w-fit gap-1 rounded-lg bg-slate-100 p-0.5">
      {(["date", "factory"] as const).map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => pick(g)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            current === g ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {g === "date" ? "По датам" : "По фабрикам"}
        </button>
      ))}
    </div>
  );
}
