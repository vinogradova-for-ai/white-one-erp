import { prisma } from "@/lib/prisma";
import { getMainScreenChecklist, groupByOwner, zoneOf, type ChecklistTask } from "@/lib/queries/main-screen-checklist";
import { moscowTodayStart } from "@/lib/dates";

/**
 * Утренний телеграм-дайджест (аудит п.9).
 *
 * Собирает по каждому владельцу задачи зоны «Сейчас» (просрочка + ≤2 дн) из
 * того же чек-листа «Главного», что рендерится на дашборде — источник срочности
 * один, дайджест и экран не разъезжаются. Плюс общий блок платежей с
 * plannedDate сегодня/завтра, ещё не оплаченных.
 *
 * Формат — человеческий, по-русски, с эмодзи-приоритетами как на дашборде:
 *   🔴 просрочено · 🟠 срочно (≤2 дн). Текст готовится отдельно от отправки,
 *   чтобы можно было показать предпросмотр без телеграма.
 */

const DAY = 86_400_000;

/** Эмодзи-приоритет задачи «Сейчас»: просрочка красная, «скоро» — оранжевая. */
function taskEmoji(t: ChecklistTask): string {
  if (t.urgency === "overdue") return "🔴";
  if (t.urgency === "soon") return "🟠";
  return "⚪"; // idle («копится») — нейтральный
}

export type DigestPayment = {
  label: string;
  amount: number;
  currency: string;
  whenLabel: string; // «сегодня» / «завтра»
  context: string | null; // номер заказа / поставщик упаковки
};

/** Формирует текст дайджеста из задач «Сейчас» (по владельцам) и платежей. */
export function buildDigestText(params: {
  ownerGroups: Array<{ ownerName: string; tasks: ChecklistTask[] }>;
  payments: DigestPayment[];
  dateLabel: string;
}): string {
  const { ownerGroups, payments, dateLabel } = params;
  const lines: string[] = [];
  lines.push(`☀️ Доброе утро! Дайджест на ${dateLabel}`);

  const totalTasks = ownerGroups.reduce((a, g) => a + g.tasks.length, 0);
  if (totalTasks === 0 && payments.length === 0) {
    lines.push("");
    lines.push("✅ В зоне «Сейчас» пусто и платежей на сегодня-завтра нет. Спокойный день.");
    return lines.join("\n");
  }

  if (ownerGroups.length > 0) {
    lines.push("");
    lines.push("📋 Задачи «Сейчас»:");
    for (const g of ownerGroups) {
      lines.push("");
      lines.push(`👤 ${g.ownerName}`);
      for (const t of g.tasks) {
        lines.push(`  ${taskEmoji(t)} ${t.text}`);
      }
    }
  }

  if (payments.length > 0) {
    lines.push("");
    lines.push("💳 Платежи на сегодня-завтра:");
    for (const p of payments) {
      const amount = p.amount.toLocaleString("ru-RU");
      const ctx = p.context ? ` · ${p.context}` : "";
      lines.push(`  💰 ${p.label} — ${amount} ${p.currency} (${p.whenLabel})${ctx}`);
    }
  }

  return lines.join("\n");
}

/** Собирает данные дайджеста из БД и формирует готовый текст. */
export async function collectDailyDigest(): Promise<{
  text: string;
  taskCount: number;
  paymentCount: number;
}> {
  const today = moscowTodayStart();
  const tomorrowEnd = new Date(today.getTime() + 2 * DAY); // конец «завтра» (эксклюзивно)

  // Задачи зоны «Сейчас» — из того же чек-листа, что на дашборде.
  const allTasks = await getMainScreenChecklist();
  const nowTasks = allTasks.filter((t) => zoneOf(t.urgency) === "now");
  const ownerGroups = groupByOwner(nowTasks).map((g) => ({
    ownerName: g.ownerName,
    tasks: g.tasks,
  }));

  // Платежи с plannedDate сегодня/завтра, ещё не оплаченные.
  const paymentsRaw = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      plannedDate: { gte: today, lt: tomorrowEnd },
    },
    orderBy: { plannedDate: "asc" },
    include: {
      order: { select: { orderNumber: true } },
    },
  });

  const payments: DigestPayment[] = paymentsRaw.map((p) => {
    const isToday = p.plannedDate.getTime() < today.getTime() + DAY;
    const context =
      p.order?.orderNumber ?? p.supplierName ?? null;
    return {
      label: p.label,
      amount: Number(p.amount),
      currency: p.currency,
      whenLabel: isToday ? "сегодня" : "завтра",
      context,
    };
  });

  const dateLabel = today.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const text = buildDigestText({ ownerGroups, payments, dateLabel });
  return { text, taskCount: nowTasks.length, paymentCount: payments.length };
}

/** Отправка текста в общий телеграм-чат. Возвращает sent=false, если env не заданы. */
export async function sendTelegramMessage(text: string): Promise<{ sent: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { sent: false, error: "TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID не заданы" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, error: `Telegram API ${res.status}: ${body}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}
