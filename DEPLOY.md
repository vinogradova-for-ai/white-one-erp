# Деплой White One ERP

> Минимальный путь: GitHub → Vercel → Neon (Postgres) → Vercel Blob (фото).
> Времени: ~30 минут на всё.

## 0. Создать репозиторий на GitHub

1. Открой https://github.com/new
2. Имя — `white-one-erp` (или любое), приват
3. **Не** проставлять «Initialize this repository with a README» — у нас уже есть код
4. Скопировать URL вида `https://github.com/USERNAME/white-one-erp.git`
5. Запушить локальный код:

```bash
cd ~/projects/white-one
git remote add origin https://github.com/USERNAME/white-one-erp.git
git branch -M main
git add .
git commit -m "white-one ERP: ready for deploy"
git push -u origin main
```

## 1. Postgres на Neon

1. https://console.neon.tech → Sign in → Create project
2. Project name: `white-one`
3. Region: ближайший (Frankfurt)
4. После создания → **Connection Details** → Pooled connection
5. Скопировать строку вида `postgresql://...?sslmode=require`. Это `DATABASE_URL`.

## 2. Vercel — деплой приложения

1. https://vercel.com/new → Import GitHub repo → выбрать `white-one-erp`
2. Framework: Next.js (определится сам)
3. **Environment Variables** — добавить:
   - `DATABASE_URL` = строка из Neon
   - `NEXTAUTH_SECRET` = `openssl rand -base64 32` (запусти в терминале и вставь)
   - `NEXTAUTH_URL` = `https://имя-проекта.vercel.app` (можно поправить после первого деплоя, увидев реальный домен)
4. **Build Command** уже подставится из `vercel.json`: `prisma generate && next build`
5. Нажать **Deploy**. Первый билд ~3 минуты.

## 3. Применить миграции на проде

После первого деплоя БД пустая. В Vercel есть встроенный **Storage > Connect Database**, но проще через локальный терминал:

```bash
# Локально, с DATABASE_URL от Neon:
DATABASE_URL="postgresql://...neon..." npx prisma migrate deploy
DATABASE_URL="postgresql://...neon..." npx prisma db seed
```

Создаст всю схему и одну учётку `alena@whiteone.ru` / `whiteone2026`.

## 4. Vercel Blob для фото (опционально, но желательно)

Без этого фото будут пытаться писать на FS — на serverless это не работает.

1. В Vercel Dashboard → проект → **Storage** → **Create Database** → Blob → имя `white-one-photos`
2. Подключить к проекту — `BLOB_READ_WRITE_TOKEN` появится в env-vars автоматически
3. Redeploy: вкладка **Deployments** → ⋯ → Redeploy

## 5. Проверить

1. Открыть `https://имя-проекта.vercel.app`
2. Войти `alena@whiteone.ru` / `whiteone2026`
3. Создать тестовый фасон + фото — проверить что фото загрузилось
4. Если всё норм — сменить пароль (или пересоздать seed с `SEED_OWNER_PASSWORD=...`)

## Если что-то сломается

- **«Invalid login»** — проверить что `NEXTAUTH_SECRET` и `NEXTAUTH_URL` стоят правильно, сделать redeploy
- **Фото не грузятся** — проверить что `BLOB_READ_WRITE_TOKEN` есть в env-vars
- **БД пустая после деплоя** — запустить `prisma migrate deploy` + `prisma db seed` локально (см. шаг 3)
- **«Module not found»** — проверить что `prisma generate` есть в build команде

## Полезное

- **Логи Vercel:** Dashboard → проект → Logs (живые) или Deployments → конкретный → Functions
- **Бэкап БД:** Neon Dashboard → Branches (можно делать снапшоты)
- **Кастомный домен:** Vercel Dashboard → Settings → Domains
