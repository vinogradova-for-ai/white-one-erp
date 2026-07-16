import { prisma } from "@/lib/prisma";

/**
 * Официальные курсы ЦБ РФ (USD, CNY) с историей в БД (CurrencyRate).
 *
 * Ленивая загрузка: спросили курс на дату → нет в БД → тянем XML_daily ЦБ,
 * сохраняем ОБЕ валюты на эту дату, отдаём. USDT считаем как USD (Алёна 16.07).
 * ЦБ по выходным курс не публикует — XML_daily на дату отдаёт последний
 * рабочий курс, его и сохраняем под запрошенной датой (так же считает 1С).
 */

const CBR_IDS: Record<string, string> = {
  USD: "R01235",
  CNY: "R01375",
};

function dayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Курс из БД или с сайта ЦБ. Бросает, если ЦБ недоступен и в БД пусто. */
export async function getCbrRate(code: "USD" | "CNY", onDate?: Date): Promise<number> {
  const date = dayUtc(onDate ?? new Date());

  const cached = await prisma.currencyRate.findUnique({
    where: { date_code: { date, code } },
  });
  if (cached) return Number(cached.rate);

  const fetched = await fetchCbrDaily(date);
  for (const [c, rate] of Object.entries(fetched)) {
    await prisma.currencyRate.upsert({
      where: { date_code: { date, code: c } },
      create: { date, code: c, rate },
      update: { rate },
    });
  }
  const rate = fetched[code];
  if (rate == null) {
    // ЦБ лёг — берём последний известный курс из истории, лучше чем упасть.
    const last = await prisma.currencyRate.findFirst({
      where: { code, date: { lte: date } },
      orderBy: { date: "desc" },
    });
    if (last) return Number(last.rate);
    throw new Error(`Курс ${code} на ${date.toISOString().slice(0, 10)} недоступен`);
  }
  return rate;
}

/** Тянет XML_daily ЦБ на дату, возвращает { USD: 78.1234, CNY: 10.8765 }. */
async function fetchCbrDaily(date: Date): Promise<Record<string, number>> {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const url = `https://www.cbr.ru/scripts/XML_daily.asp?date_req=${dd}/${mm}/${yyyy}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return {};
    const buf = await res.arrayBuffer();
    const xml = new TextDecoder("windows-1251").decode(buf);

    const out: Record<string, number> = {};
    for (const [code, cbrId] of Object.entries(CBR_IDS)) {
      // <Valute ID="R01235">…<Nominal>1</Nominal>…<Value>78,1234</Value>…</Valute>
      const m = xml.match(
        new RegExp(
          `<Valute ID="${cbrId}">[\\s\\S]*?<Nominal>(\\d+)</Nominal>[\\s\\S]*?<Value>([\\d,\\.]+)</Value>`,
        ),
      );
      if (!m) continue;
      const nominal = Number(m[1]) || 1;
      const value = Number(m[2].replace(",", "."));
      if (Number.isFinite(value) && value > 0) {
        out[code] = Math.round((value / nominal) * 10000) / 10000;
      }
    }
    return out;
  } catch {
    return {};
  }
}
