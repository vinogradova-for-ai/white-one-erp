// Сохранение графика платежей заказа упаковки при правке БЕЗ потери истории оплат.
//
// Аналог reconcile-order-payments (PR #182), но по образцу «обновляем по id»:
// раньше PATCH /api/packaging-orders/[id] делал deleteMany+createMany всех
// платежей — paidAt/paidById перезаписывались на «сейчас»/редактора при любой
// косметической правке, а чекбокс «Оплачено» обходил право payment.markPaid.
//
// Теперь:
//   • существующие платежи (id совпал) — ОБНОВЛЯЕМ (planned/amount/label),
//     оплаченные сохраняют свои paidAt/paidById;
//   • новые строки (без id или id не из БД) — СОЗДАЁМ;
//   • убранные из формы — УДАЛЯЕМ только НЕоплаченные (PAID не трогаем);
//   • смена флага paid у платежа — только если у актора есть право markPaid.

export type IncomingPackagingPayment = {
  id?: string | null;
  plannedDate: string;
  amount: number;
  label: string;
  paid?: boolean;
};

export type ExistingPackagingPayment = {
  id: string;
  status: "PENDING" | "PAID";
};

export type PackagingPaymentPlan = {
  /** Обновить существующие платежи (по id). setPaid: undefined — флаг не менять. */
  toUpdate: Array<{
    id: string;
    plannedDate: string;
    amount: number;
    label: string;
    /** Новое значение флага «оплачено» ИЛИ undefined, если менять не надо/нельзя. */
    setPaid?: boolean;
  }>;
  /** Создать новые платежи. */
  toCreate: IncomingPackagingPayment[];
  /** Удалить платежи по id (только НЕоплаченные, которых больше нет в форме). */
  toDeleteIds: string[];
  /** true — во входящих данных есть попытка сменить флаг paid без права. */
  paidChangeDenied: boolean;
};

/**
 * Считает план синхронизации платежей упаковки.
 *
 * @param incoming    строки из формы
 * @param existing    платежи заказа в БД (id + статус)
 * @param canMarkPaid есть ли у актора право payment.markPaid
 */
export function planPackagingPayments(
  incoming: IncomingPackagingPayment[],
  existing: ExistingPackagingPayment[],
  canMarkPaid: boolean,
): PackagingPaymentPlan {
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const incomingIds = new Set(
    incoming.map((p) => p.id).filter((id): id is string => !!id && existingById.has(id)),
  );

  const toUpdate: PackagingPaymentPlan["toUpdate"] = [];
  const toCreate: IncomingPackagingPayment[] = [];
  let paidChangeDenied = false;

  for (const p of incoming) {
    const ex = p.id ? existingById.get(p.id) : undefined;
    if (ex) {
      // Существующий платёж — обновляем поля. Разбираемся с флагом paid.
      const wasPaid = ex.status === "PAID";
      const wantsPaid = !!p.paid;
      let setPaid: boolean | undefined = undefined;
      if (wantsPaid !== wasPaid) {
        if (canMarkPaid) {
          setPaid = wantsPaid;
        } else {
          // Нет права менять отметку оплаты — оставляем как было, флажим отказ.
          paidChangeDenied = true;
        }
      }
      toUpdate.push({
        id: ex.id,
        plannedDate: p.plannedDate,
        amount: p.amount,
        label: p.label,
        setPaid,
      });
    } else {
      // Новая строка. Если её создают сразу «оплаченной» без права — создаём PENDING.
      if (p.paid && !canMarkPaid) {
        paidChangeDenied = true;
        toCreate.push({ ...p, paid: false });
      } else {
        toCreate.push(p);
      }
    }
  }

  // Удаляем только те существующие платежи, которых нет в форме И которые НЕ оплачены.
  const toDeleteIds = existing
    .filter((e) => !incomingIds.has(e.id) && e.status !== "PAID")
    .map((e) => e.id);

  return { toUpdate, toCreate, toDeleteIds, paidChangeDenied };
}
