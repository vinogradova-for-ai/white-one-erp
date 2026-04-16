import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { RbacError } from "@/lib/rbac";
import type { Role } from "@prisma/client";

export type AuthedSession = {
  user: { id: string; name?: string | null; email?: string | null; role: Role };
};

export async function requireAuth(): Promise<AuthedSession> {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();
  return session as AuthedSession;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Требуется авторизация");
    this.name = "UnauthorizedError";
  }
}

export class ValidationError extends Error {
  constructor(public fields: Record<string, string[]>) {
    super("Ошибка валидации");
    this.name = "ValidationError";
  }
}

export function apiError(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: { code: "unauthorized", message: err.message } }, { status: 401 });
  }
  if (err instanceof RbacError) {
    return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.join(".") || "_root";
      (fields[path] ??= []).push(issue.message);
    }
    return NextResponse.json({ error: { code: "validation", message: "Ошибка валидации", fields } }, { status: 400 });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: { code: "validation", message: err.message, fields: err.fields } }, { status: 400 });
  }
  console.error("API error:", err);
  const msg = err instanceof Error ? err.message : "Внутренняя ошибка";
  return NextResponse.json({ error: { code: "internal", message: msg } }, { status: 500 });
}
