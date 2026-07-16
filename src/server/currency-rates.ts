import { prisma } from "@/lib/prisma";

/**
 * Официальные курсы ЦБ РФ (USD, CNY) с историей в БД (CurrencyRate).
 *
 * Ленивая загрузка: спросили курс на дату → нет в БД → тянем с зеркала
 * cbr-xml-daily.ru (JSON, дружелюбно к зарубежным серверам; сам cbr.ru часто
 * не отвечает из-за границы — проверено 16.07: таймаут), запасной путь —
 * XML_daily самого ЦБ. Сохраняем обе валюты на дату, отдаём. USDT считаем
 * как USD (Алёна 16.07).
 *
 * ЦБ по выходным курс не публикует — идём назад до последнего рабочего дня
 * (максимум 7) и сохраняем его значение под запрошенной датой (как в 1С).
 */

const CODES = ["USD", "CNY"] as const;

function dayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Курс из БД или с зеркала/сайта ЦБ. Бросает, если источники недоступны и в БД пусто. */
export async function getCbrRate(code: "USD" | "CNY", onDate?: Date): Promise<number> {
  const date = dayUtc(onDate ?? new Date());

  const cached = await prisma.currencyRate.findUnique({
    where: { date_code: { date, code } },
  });
  if (cached) return Number(cached.rate);

  const fetched = await fetchRatesWithFallback(date);
  if (fetched) {
    for (const c of CODES) {
      const rate = fetched[c];
      if (rate != null) {
        await prisma.currencyRate.upsert({
          where: { date_code: { date, code: c } },
          create: { date, code: c, rate },
          update: { rate },
        });
      }
    }
    const rate = fetched[code];
    if (rate != null) return rate;
  }

  // Источники легли — берём последний известный курс из истории, лучше чем упасть.
  const last = await prisma.currencyRate.findFirst({
    where: { code, date: { lte: date } },
    orderBy: { date: "desc" },
  });
  if (last) return Number(last.rate);
  throw new Error(`Курс ${code} на ${date.toISOString().slice(0, 10)} недоступен`);
}

/** Пробует дату и до 7 дней назад (выходные/праздники), зеркало → ЦБ. */
async function fetchRatesWithFallback(date: Date): Promise<Record<string, number> | null> {
  const todayUtc = dayUtc(new Date()).getTime();
  for (let back = 0; back <= 7; back++) {
    const d = new Date(date.getTime() - back * 86_400_000);
    // «Сегодняшний» урл зеркала — ТОЛЬКО если дата реально сегодня, иначе архив
    // (баг 16.07: для майской даты уезжал сегодняшний курс).
    const fromMirror = await fetchMirror(d, dayUtc(d).getTime() === todayUtc);
    if (fromMirror) return fromMirror;
    const fromCbr = await fetchCbrXml(d);
    if (fromCbr) return fromCbr;
  }
  return null;
}

/** Зеркало cbr-xml-daily.ru: сегодня — daily_json.js, прошлые даты — архив. */
async function fetchMirror(d: Date, isToday: boolean): Promise<Record<string, number> | null> {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const url = isToday
    ? "https://www.cbr-xml-daily.ru/daily_json.js"
    : `https://www.cbr-xml-daily.ru/archive/${yyyy}/${mm}/${dd}/daily_json.js`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      Valute?: Record<string, { Value: number; Nominal: number }>;
    };
    if (!j.Valute) return null;
    const out: Record<string, number> = {};
    for (const code of CODES) {
      const v = j.Valute[code];
      if (v && Number.isFinite(v.Value) && v.Nominal > 0) {
        out[code] = Math.round((v.Value / v.Nominal) * 10000) / 10000;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

const CBR_IDS: Record<string, string> = { USD: "R01235", CNY: "R01375" };

/** Запасной путь: XML_daily самого ЦБ (windows-1251). */
async function fetchCbrXml(d: Date): Promise<Record<string, number> | null> {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const url = `https://www.cbr.ru/scripts/XML_daily.asp?date_req=${dd}/${mm}/${yyyy}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const xml = new TextDecoder("windows-1251").decode(buf);
    const out: Record<string, number> = {};
    for (const code of CODES) {
      const m = xml.match(
        new RegExp(
          `<Valute ID="${CBR_IDS[code]}">[\\s\\S]*?<Nominal>(\\d+)</Nominal>[\\s\\S]*?<Value>([\\d,\\.]+)</Value>`,
        ),
      );
      if (!m) continue;
      const nominal = Number(m[1]) || 1;
      const value = Number(m[2].replace(",", "."));
      if (Number.isFinite(value) && value > 0) {
        out[code] = Math.round((value / nominal) * 10000) / 10000;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}
