"use client";

import { useState } from "react";
import { toast } from "sonner";

export function IncomingExportButton() {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch("/api/incoming/export");
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Не удалось сформировать файл (${res.status})`);
      }
      const blob = await res.blob();
      const dispo = res.headers.get("content-disposition") ?? "";
      const m = /filename="?([^"]+)"?/.exec(dispo);
      const fileName = m?.[1] ?? `incoming-plan-${new Date().toISOString().slice(0, 10)}.xlsx`;

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
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      title="План отгрузок: общий лист + лист с размерами по каждому артикулу"
    >
      {loading ? "Готовлю…" : "⤓ Выгрузить XLSX"}
    </button>
  );
}
