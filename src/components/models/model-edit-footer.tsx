"use client";

import { useRouter } from "next/navigation";

export function ModelEditFooter() {
  const router = useRouter();
  return (
    <div className="sticky bottom-0 z-20 flex justify-end gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
      <button
        type="button"
        onClick={() => router.back()}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"
      >
        Отмена
      </button>
      <button
        type="submit"
        form="model-edit-form"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Сохранить
      </button>
    </div>
  );
}
