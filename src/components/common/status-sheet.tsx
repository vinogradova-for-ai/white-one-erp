"use client";

import { useEffect, useState } from "react";

/**
 * Bottom-sheet для мобильных и popup для десктопа.
 * Полноэкранный на мобильных, выпадающий на десктопе.
 */
export function StatusSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/50"
      />

      {/* Mobile: bottom sheet. Desktop: centered modal. */}
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-2xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[80vh] md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4 pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>
    </>
  );
}

export function useSheet() {
  const [open, setOpen] = useState(false);
  return {
    open,
    openSheet: () => setOpen(true),
    closeSheet: () => setOpen(false),
  };
}
