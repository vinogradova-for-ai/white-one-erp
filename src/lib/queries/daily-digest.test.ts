import { describe, it, expect } from "vitest";
import { buildDigestText, type DigestPayment } from "@/lib/queries/daily-digest";
import type { ChecklistTask } from "@/lib/queries/main-screen-checklist";

function task(partial: Partial<ChecklistTask>): ChecklistTask {
  return {
    id: "t1",
    ownerId: "o1",
    ownerName: "Настя",
    text: "Примите ОТК · #123",
    href: "/orders/1",
    daysToDeadline: -2,
    urgency: "overdue",
    updatedAt: null,
    kind: "accept-qc",
    ageInDays: null,
    slaBreached: false,
    ...partial,
  };
}

describe("buildDigestText", () => {
  it("пустой день — отдаёт спокойное сообщение", () => {
    const text = buildDigestText({ ownerGroups: [], payments: [], dateLabel: "2 июля" });
    expect(text).toContain("Спокойный день");
    expect(text).toContain("2 июля");
  });

  it("группирует задачи по владельцу с эмодзи-приоритетами", () => {
    const text = buildDigestText({
      ownerGroups: [
        {
          ownerName: "Настя",
          tasks: [
            task({ urgency: "overdue", text: "Примите ОТК · #123" }),
            task({ urgency: "soon", text: "Проверьте доставку · #124", daysToDeadline: 1 }),
          ],
        },
      ],
      payments: [],
      dateLabel: "2 июля",
    });
    expect(text).toContain("👤 Настя");
    expect(text).toContain("🔴 Примите ОТК · #123");
    expect(text).toContain("🟠 Проверьте доставку · #124");
  });

  it("выводит блок платежей с суммой и контекстом", () => {
    const payments: DigestPayment[] = [
      { label: "Предоплата 30%", amount: 150000, currency: "RUB", whenLabel: "сегодня", context: "#123" },
    ];
    const text = buildDigestText({ ownerGroups: [], payments, dateLabel: "2 июля" });
    expect(text).toContain("Платежи на сегодня-завтра");
    expect(text).toContain("Предоплата 30%");
    expect(text).toContain("сегодня");
    expect(text).toContain("#123");
  });
});
