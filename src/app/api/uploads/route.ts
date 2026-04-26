import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { put } from "@vercel/blob";
import { requireAuth, apiError } from "@/server/api-helpers";

/**
 * Загрузка файлов с двумя стратегиями:
 *   1. Если задан BLOB_READ_WRITE_TOKEN (Vercel Blob) — пишем в облако и возвращаем публичный URL.
 *   2. Иначе пишем на локальную файловую систему в public/uploads/ (только для dev / Selectel-VM).
 *
 * На serverless (Vercel/Netlify) FS не работает — поэтому BLOB_READ_WRITE_TOKEN обязателен в проде.
 */
const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^\w.\-]+/g, "_").slice(-80);
  return base || "file";
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const form = await req.formData();
    const files = form.getAll("file");
    if (files.length === 0) {
      return NextResponse.json(
        { error: { code: "validation", message: "Не приложен ни один файл" } },
        { status: 400 },
      );
    }

    const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
    if (!useBlob) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const urls: string[] = [];
    for (const item of files) {
      if (!(item instanceof File)) continue;
      if (item.size === 0) continue;
      if (item.size > MAX_SIZE) {
        return NextResponse.json(
          { error: { code: "validation", message: `Файл «${item.name}» больше 10 МБ — слишком тяжёлый` } },
          { status: 400 },
        );
      }
      if (item.type && !ALLOWED_MIME.has(item.type)) {
        return NextResponse.json(
          { error: { code: "validation", message: `Файл «${item.name}» не картинка — JPG/PNG/WEBP/GIF/HEIC` } },
          { status: 400 },
        );
      }

      const prefix = randomBytes(8).toString("hex");
      const safe = sanitizeFilename(item.name || "image");
      const fileName = `${prefix}-${safe}`;

      if (useBlob) {
        // Vercel Blob — пишем в облако, получаем публичный URL.
        const blob = await put(`uploads/${fileName}`, item, {
          access: "public",
          addRandomSuffix: false,
        });
        urls.push(blob.url);
      } else {
        // Локальная FS (dev / VM-deploy).
        const fullPath = join(UPLOAD_DIR, fileName);
        const buf = Buffer.from(await item.arrayBuffer());
        await writeFile(fullPath, buf);
        urls.push(`/uploads/${fileName}`);
      }
    }

    if (urls.length === 0) {
      return NextResponse.json(
        { error: { code: "validation", message: "Нет подходящих файлов" } },
        { status: 400 },
      );
    }

    return NextResponse.json({ urls });
  } catch (e) {
    return apiError(e);
  }
}
