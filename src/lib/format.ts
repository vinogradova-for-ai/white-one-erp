import dayjs from "dayjs";
import "dayjs/locale/ru";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("ru");

const TZ = "Europe/Moscow"; // ТЗ: всё отображаем в MSK

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dayjs(value).tz(TZ).format("DD.MM.YYYY");
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dayjs(value).tz(TZ).format("DD.MM.YYYY HH:mm");
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dayjs(value).tz(TZ).fromNow();
}

export function formatCurrency(
  value: number | string | null | undefined,
  opts: { currency?: "RUB" | "CNY"; maximumFractionDigits?: number } = {},
): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const currency = opts.currency ?? "RUB";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: opts.maximumFractionDigits ?? 0,
  }).format(n);
}

export function formatNumber(
  value: number | string | null | undefined,
  digits = 0,
): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatPercent(
  value: number | string | null | undefined,
  digits = 1,
): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(n / 100);
}

export function yearMonthToLabel(yyyymm: number): string {
  const y = Math.floor(yyyymm / 100);
  const m = yyyymm % 100;
  const date = dayjs(`${y}-${String(m).padStart(2, "0")}-01`);
  return date.format("MMMM YYYY");
}

export function daysUntil(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const now = dayjs().tz(TZ).startOf("day");
  const target = dayjs(value).tz(TZ).startOf("day");
  return target.diff(now, "day");
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
