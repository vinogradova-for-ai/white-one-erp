// Клиентский хелпер: разбирает ответ API с ошибкой в удобную структуру для форм.

export type ApiErrorResult = {
  /** Главное сообщение, подходит для общего баннера */
  message: string;
  /** Карта ошибок по полям: ключ — имя поля, значение — список сообщений. */
  fields: Record<string, string[]>;
  /** Код ошибки: validation / prisma_p2002 / unauthorized / internal / ... */
  code: string;
  /** HTTP статус */
  status: number;
};

export async function parseApiError(res: Response): Promise<ApiErrorResult> {
  let body: { error?: { code?: string; message?: string; fields?: Record<string, string[]> } } = {};
  try {
    body = await res.json();
  } catch {
    // Не JSON — возможно HTML-страница ошибки
  }
  const err = body?.error ?? {};
  const code = err.code ?? `http_${res.status}`;
  const fields = err.fields ?? {};
  let message = err.message;
  if (!message) {
    if (res.status === 401) message = "Нужно войти заново — сессия истекла.";
    else if (res.status === 403) message = "Нет прав на это действие.";
    else if (res.status === 404) message = "Запись не найдена.";
    else if (res.status === 409) message = "Конфликт данных. Возможно, запись уже изменена.";
    else if (res.status >= 500) message = "Ошибка сервера. Попробуйте ещё раз через минуту.";
    else message = "Что-то пошло не так. Попробуйте ещё раз.";
  }
  return { message, fields, code, status: res.status };
}

/** Достаёт ошибку для конкретного поля (с учётом вложенных типа `lines.0.quantity`). */
export function fieldError(err: ApiErrorResult | null, fieldPath: string): string | null {
  if (!err) return null;
  const direct = err.fields[fieldPath];
  if (direct && direct.length > 0) return direct.join(". ");
  return null;
}
