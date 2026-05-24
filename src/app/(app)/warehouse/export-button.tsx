"use client";

import { useState } from "react";
import { toast } from "sonner";

export function ExportButton() {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch("/api/warehouse/export");
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Не удалось сформировать файл (${res.status})`);
      }
      const blob = await res.blob();
      const dispo = res.headers.get("content-disposition") ?? "";
      const m = /filename="?([^"]+)"?/.exec(dispo);
      const fileName = m?.[1] ?? `warehouse-${new Date().toISOString().slice(0, 10)}.xlsx`;

      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Файл готов");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
    >
      {loading ? "Готовим файл…" : "Скачать XLSX"}
    </button>
  );
}
