"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/constants";

const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

export function RoleCell({
  userId,
  role,
  canEdit,
  actorIsOwner,
}: {
  userId: string;
  role: Role;
  canEdit: boolean; // админ и не сам себе
  actorIsOwner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // DIRECTOR не может назначать/снимать OWNER и DIRECTOR
  const options = actorIsOwner
    ? ALL_ROLES
    : ALL_ROLES.filter((r) => r !== "OWNER" && r !== "DIRECTOR");
  const editable = canEdit && (actorIsOwner || !["OWNER", "DIRECTOR"].includes(role));

  if (!editable) {
    return <span className="text-xs text-slate-600">{ROLE_LABELS[role]}</span>;
  }

  async function change(next: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error?.message ?? "Не удалось сменить роль");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <select
        value={role}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
      >
        {options.map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </select>
      {err && <span className="ml-2 text-[11px] text-red-600">{err}</span>}
    </span>
  );
}
