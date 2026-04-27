import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { requireAuth, apiError } from "@/server/api-helpers";

/**
 * Загрузка файлов:
 *   1. Если задан BLOB_READ_WRITE_TOKEN (Vercel Blob) — пишем в облако.
 *   2. Иначе пишем на локальную файловую систему в public/uploads/ (только для dev).
 *
 * Перед сохранением все картинки (кроме HEIC/HEIF) ужимаются sharp:
 *   — ресайз до 1600px по длинной стороне
 *   — WebP, quality 80
 *   — auto-rotate по EXIF, чтобы фото с телефона не лежали на боку
 * HEIC/HEIF проходят как есть (sharp не всегда их умеет на serverless).
 */
const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB на исходный файл — после сжатия будет ~300 КБ
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 80;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const SHARPABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^\w.\-]+/g, "_").slice(-80);
  return base || "file";
}

async function compress(buf: Buffer, mime: string): Promise<{ buf: Buffer; ext: string; mime: string }> {
  if (!SHARPABLE.has(mime)) {
    // HEIC/HEIF — оставляем как есть
    const ext = mime.split("/")[1] ?? "bin";
    return { buf, ext, mime };
  }
  const out = await sharp(buf, { animated: mime === "image/gif" })
    .rotate() // авто-поворот по EXIF
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return { buf: out, ext: "webp", mime: "image/webp" };
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
          { error: { code: "validation", message: `Файл «${item.name}» больше 25 МБ — слишком тяжёлый` } },
          { status: 400 },
        );
      }
      if (item.type && !ALLOWED_MIME.has(item.type)) {
        return NextResponse.json(
          { error: { code: "validation", message: `Файл «${item.name}» не картинка — JPG/PNG/WEBP/GIF/HEIC` } },
          { status: 400 },
        );
      }

      const original = Buffer.from(await item.arrayBuffer());
      const { buf, ext, mime } = await compress(original, item.type || "image/jpeg");

      const prefix = randomBytes(8).toString("hex");
      const baseName = sanitizeFilename(item.name || "image").replace(/\.[^.]+$/, "");
      const fileName = `${prefix}-${baseName}.${ext}`;

      if (useBlob) {
        const blob = await put(`uploads/${fileName}`, buf, {
          access: "public",
          addRandomSuffix: false,
          contentType: mime,
        });
        urls.push(blob.url);
      } else {
        const fullPath = join(UPLOAD_DIR, fileName);
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
