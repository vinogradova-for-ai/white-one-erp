"use client";

import { useRouter } from "next/navigation";

export function ModelEditFooter() {
  const router = useRouter();
  return (
    <div className="pb-safe sticky bottom-16 z-20 flex gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg md:bottom-0 md:justify-end">
      <button
        type="button"
        onClick={() => router.back()}
        className="flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm"
      >
        Отмена
      </button>
      <button
        type="submit"
        form="model-edit-form"
        className="flex h-11 flex-1 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 md:flex-none"
      >
        Сохранить
      </button>
    </div>
  );
}
