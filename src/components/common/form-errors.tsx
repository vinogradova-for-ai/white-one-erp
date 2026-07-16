import { type ApiErrorResult, fieldError } from "@/lib/api-error";

/**
 * Общий баннер с ошибкой от сервера. Показывает message + список ошибок по полям,
 * если они не рендерятся рядом с инпутами.
 */
export function FormErrorBanner({
  error,
  ignoreFields = [],
}: {
  error: ApiErrorResult | null;
  /** Поля, ошибки по которым уже показываются рядом с инпутом — не дублируем в баннер */
  ignoreFields?: string[];
}) {
  if (!error) return null;
  const extraFields = Object.entries(error.fields).filter(([k]) => !ignoreFields.includes(k));
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-400/20 bg-red-50 dark:bg-red-400/10 p-3 text-sm text-red-800 dark:text-red-300">
      <div className="font-medium">{error.message}</div>
      {extraFields.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
          {extraFields.flatMap(([k, msgs]) =>
            msgs.map((m, i) => (
              <li key={`${k}-${i}`}>{m}</li>
            )),
          )}
        </ul>
      )}
    </div>
  );
}

/** Ошибка по конкретному полю — ставится под инпутом */
export function FieldError({ error, field }: { error: ApiErrorResult | null; field: string }) {
  const msg = fieldError(error, field);
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-600 dark:text-red-300">{msg}</p>;
}
