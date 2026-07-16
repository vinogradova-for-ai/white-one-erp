import { getStatsPage } from "@/lib/queries/stats-page";
import { getTeamMonthStats } from "@/lib/queries/team-month-stats";
import { getTeamProjects } from "@/lib/queries/team-projects";
import { StatsClient } from "@/components/stats/stats-client";

/**
 * Вкладка «Статистика» (/stats).
 *
 * Серверный компонент: тянет расчёт за ПОСЛЕДНИЕ 12 месяцев (максимум окна тренда)
 * с учётом фильтра «Ответственный» из URL (?owner=<id>). Переключатели периода
 * (6/12) и метрики (штуки/фасоны/деньги) — чисто клиентские (display), поэтому
 * данные тянем один раз на 12 месяцев, а клиент режет до 6 при необходимости.
 *
 * Сверху — блок «Команда в месяце» (переехал сюда с дашборда) + «Проекты по людям»
 * (что закреплено за человеком сейчас: фасоны в разработке и активные заказы).
 * Переключатель месяца (‹ ›) блока команды работает на /stats через ?month=.
 *
 * ⚠️ ГРАНИЦА: только операционка отдела продукта — никакой выручки/маржи/продаж WB.
 */

export const dynamic = "force-dynamic";

/** Парсит ?month=YYYY-MM в число YYYYMM. undefined — не задан/невалиден. */
function parseMonthParam(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!m) return undefined;
  const ym = Number(m[1]) * 100 + Number(m[2]);
  return Number.isFinite(ym) ? ym : undefined;
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const ownerId = sp.owner ?? null;

  // Всегда 12 месяцев — окно тренда максимальное; клиент покажет 6 или 12.
  // Параллельно: тренд/люди/фабрики, командные итоги месяца, проекты по людям.
  const [stats, teamMonth, projectsMap] = await Promise.all([
    getStatsPage({ trendMonths: 12, ownerId }),
    getTeamMonthStats(parseMonthParam(sp.month)),
    getTeamProjects(ownerId),
  ]);

  // Map → простой объект для передачи в клиентский компонент.
  const projects = Object.fromEntries(projectsMap);

  return (
    <StatsClient
      stats={stats}
      teamMonth={teamMonth}
      projects={projects}
      selectedOwnerId={ownerId}
    />
  );
}
