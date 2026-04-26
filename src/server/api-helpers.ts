import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { RbacError } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { Prisma } from "@prisma/client";

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

// Человеческие лейблы полей в сообщениях об ошибках.
// Нужны, когда Prisma/Zod отдают техническое имя поля (sku, name...) — подставляем русское.
const FIELD_LABELS: Record<string, string> = {
  name: "Название",
  sku: "Артикул",
  colorName: "Цвет",
  orderNumber: "Номер заказа",
  email: "Email",
  packagingItemId: "Упаковка",
  productModelId: "Фасон",
  productVariantId: "Цветомодель",
  categoryId: "Категория",
  factoryId: "Фабрика",
  ownerId: "Ответственный",
  sizeGridId: "Размерная сетка",
  fabricName: "Название ткани",
  fabricComposition: "Состав ткани",
  fabricPricePerMeter: "Цена ткани за метр",
  purchasePriceRub: "Закупочная цена, ₽",
  purchasePriceCny: "Закупочная цена, ¥",
  wbPrice: "Цена WB",
  customerPrice: "Цена для клиента",
  quantity: "Количество",
  stock: "На складе",
  unitPriceRub: "Цена за штуку, ₽",
  unitPriceCny: "Цена за штуку, ¥",
  cnyRubRate: "Курс ¥ → ₽",
  expectedDate: "Дата ожидания",
  plannedDate: "Плановая дата",
  launchMonth: "Месяц старта",
  patternsUrl: "Ссылка на материалы",
  photoUrl: "Ссылка на фото",
  photoUrls: "Фотографии",
  targetCostRub: "Таргет себестоимости, ₽",
  targetCostCny: "Таргет себестоимости, ¥",
  lines: "Позиции",
};

function fieldLabel(path: string): string {
  // Для вложенных полей типа "lines.0.quantity" показываем последнее сегмент + позицию
  const segs = path.split(".");
  const last = segs[segs.length - 1];
  const label = FIELD_LABELS[last] ?? last;
  const posIdx = segs.findIndex((s) => /^\d+$/.test(s));
  if (posIdx >= 0) {
    const n = Number(segs[posIdx]) + 1;
    return `${label} (позиция ${n})`;
  }
  return label;
}

// Переводит Zod-сообщения в человеческие фразы
function humanizeZodIssue(msg: string, path: string): string {
  const label = fieldLabel(path);
  const lower = msg.toLowerCase();
  // Типовые паттерны от Zod
  if (lower.includes("required") || lower === "required" || lower.includes("обязательно")) {
    return `${label}: обязательное поле`;
  }
  if (lower.includes("invalid url") || lower.includes("invalid_url")) {
    return `${label}: должна быть корректная ссылка (начинается с http:// или https://)`;
  }
  if (lower.includes("invalid email")) {
    return `${label}: некорректный email`;
  }
  if (lower.includes("expected number") || lower.includes("nan")) {
    return `${label}: нужно число`;
  }
  if (lower.includes("expected string") || lower.includes("expected boolean") || lower.includes("expected one of")) {
    return `${label}: некорректное значение`;
  }
  if (lower.includes("too small") || lower.includes("must be greater")) {
    return `${label}: значение слишком мало`;
  }
  if (lower.includes("too big") || lower.includes("exceeds")) {
    return `${label}: значение слишком большое`;
  }
  if (lower.includes("must be unique") || lower.includes("duplicate")) {
    return `${label}: уже используется, выберите другое`;
  }
  // Собственные кастомные сообщения — Zod propagates as-is
  return msg.startsWith("__") ? msg.slice(2) : `${label}: ${msg}`;
}

// Prisma error codes → человеческое сообщение
// https://www.prisma.io/docs/reference/api-reference/error-reference
function humanizePrisma(err: Prisma.PrismaClientKnownRequestError): { status: number; message: string; fields?: Record<string, string[]> } {
  switch (err.code) {
    case "P2002": {
      // Unique constraint violation
      const target = (err.meta?.target as string[] | string | undefined) ?? [];
      const targetArr = Array.isArray(target) ? target : [target];
      const fieldName = targetArr[0] ?? "поле";
      const label = fieldLabel(fieldName);
      return {
        status: 409,
        message: `${label} уже занят(о) — выберите другое значение`,
        fields: { [fieldName]: [`${label} уже используется`] },
      };
    }
    case "P2003": {
      // Foreign key violation
      const field = (err.meta?.field_name as string | undefined) ?? "";
      const label = field ? fieldLabel(field) : "связанная запись";
      return {
        status: 400,
        message: `${label}: запись не найдена или была удалена. Обновите страницу и попробуйте снова.`,
      };
    }
    case "P2025": {
      // Record not found
      return { status: 404, message: "Запись не найдена. Возможно, она была удалена." };
    }
    case "P2014": {
      // The change you are trying to make would violate the required relation
      return {
        status: 400,
        message: "Нельзя удалить: на эту запись ссылаются другие данные. Сначала уберите связи.",
      };
    }
    default:
      return { status: 500, message: `Ошибка базы данных (${err.code}). Попробуйте ещё раз или обновите страницу.` };
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
    const formMessages: string[] = [];
    for (const issue of err.issues) {
      const path = issue.path.join(".") || "_root";
      const humanMsg = humanizeZodIssue(issue.message, path);
      (fields[path] ??= []).push(humanMsg);
      formMessages.push(humanMsg);
    }
    const topMessage = formMessages.length === 1
      ? formMessages[0]
      : `Проверьте поля: ${formMessages.slice(0, 3).join("; ")}${formMessages.length > 3 ? "…" : ""}`;
    return NextResponse.json(
      { error: { code: "validation", message: topMessage, fields } },
      { status: 400 },
    );
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: { code: "validation", message: err.message, fields: err.fields } }, { status: 400 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const h = humanizePrisma(err);
    return NextResponse.json(
      { error: { code: `prisma_${err.code.toLowerCase()}`, message: h.message, ...(h.fields && { fields: h.fields }) } },
      { status: h.status },
    );
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    // Эти ошибки — обычно баг в коде, но пользователю покажем мягко
    console.error("Prisma validation error:", err);
    return NextResponse.json(
      { error: { code: "internal", message: "Ошибка данных. Проверьте заполненные поля и попробуйте ещё раз." } },
      { status: 400 },
    );
  }
  console.error("API error:", err);
  const msg = err instanceof Error ? err.message : "Что-то пошло не так. Попробуйте ещё раз.";
  // Не пробрасываем технические детали пользователю
  const userMsg = msg.length > 200 || /prisma|typeerror|undefined|\{.*\}/i.test(msg)
    ? "Что-то пошло не так. Попробуйте ещё раз или обновите страницу."
    : msg;
  return NextResponse.json({ error: { code: "internal", message: userMsg } }, { status: 500 });
}
