import { getStatsPage } from "@/lib/queries/stats-page";
import { StatsClient } from "@/components/stats/stats-client";

/**
 * Вкладка «Статистика» (/stats).
 *
 * Серверный компонент: тянет расчёт за ПОСЛЕДНИЕ 12 месяцев (максимум окна тренда)
 * с учётом фильтра «Ответственный» из URL (?owner=<id>). Переключатели периода
 * (6/12) и метрики (штуки/фасоны/деньги) — чисто клиентские (display), поэтому
 * данные тянем один раз на 12 месяцев, а клиент режет до 6 при необходимости.
 *
 * ⚠️ ГРАНИЦА: только операционка отдела продукта — никакой выручки/маржи/продаж WB.
 */

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const sp = await searchParams;
  const ownerId = sp.owner ?? null;

  // Всегда 12 месяцев — окно тренда максимальное; клиент покажет 6 или 12.
  const stats = await getStatsPage({ trendMonths: 12, ownerId });

  return <StatsClient stats={stats} selectedOwnerId={ownerId} />;
}
