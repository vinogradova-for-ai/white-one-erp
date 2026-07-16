import { NextRequest, NextResponse } from "next/server";
import { collectDailyDigest, sendTelegramMessage } from "@/lib/queries/daily-digest";

// Утренний телеграм-дайджест (аудит п.9). Вызывается Vercel Cron в 06:00 UTC
// (09:00 МСК) — см. vercel.json. Защита: заголовок Authorization: Bearer
// ${CRON_SECRET} (стандарт Vercel Cron). В dev без секрета — отдаём предпросмотр
// текста (sent=false), чтобы админ мог глянуть, что уйдёт, не дёргая телеграм.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const authorized = !!secret && auth === `Bearer ${secret}`;

  // В dev (нет CRON_SECRET или явно не прод) без валидного заголовка — только
  // предпросмотр текста, ничего не отправляем. В прод без секрета — 401.
  const isDev = process.env.NODE_ENV !== "production";
  if (!authorized && !isDev) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { text, taskCount, paymentCount } = await collectDailyDigest();

  // Предпросмотр: авторизованного крона нет (dev) — не шлём, отдаём текст.
  if (!authorized) {
    return NextResponse.json({
      preview: true,
      sent: false,
      taskCount,
      paymentCount,
      text,
    });
  }

  const result = await sendTelegramMessage(text);
  return NextResponse.json({
    sent: result.sent,
    ...(result.error ? { error: result.error } : {}),
    taskCount,
    paymentCount,
    text,
  });
}
