import type { Metadata, Viewport } from "next";
import { Great_Vibes, Pacifico, Caveat } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

// Рукописные шрифты для курсивных надписей на доске фасонов (/models/board).
// Все три поддерживают латиницу И кириллицу — красиво и для «with love», и «с любовью».
const greatVibes = Great_Vibes({ weight: "400", subsets: ["latin", "cyrillic"], variable: "--font-script-vibes", display: "swap" });
const pacifico = Pacifico({ weight: "400", subsets: ["latin", "cyrillic"], variable: "--font-script-pacifico", display: "swap" });
const caveat = Caveat({ weight: ["400", "700"], subsets: ["latin", "cyrillic"], variable: "--font-script-caveat", display: "swap" });
const scriptFontVars = `${greatVibes.variable} ${pacifico.variable} ${caveat.variable}`;

export const metadata: Metadata = {
  title: "White One ERP",
  description: "Система управления продуктовым циклом",
  // PWA-лайт «на экран домой»: манифест + иконки. Сервис-воркера/оффлайна нет.
  manifest: "/manifest.webmanifest",
  applicationName: "White One",
  appleWebApp: {
    capable: true,
    title: "White One",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// viewport-fit=cover — чтобы работали safe-area-inset (чёлка/домашняя полоса iPhone).
// maximum-scale не ставим: не блокируем зум (доступность).
// theme-color здесь НЕ задаём: тема кабинета — ручной класс .dark из
// localStorage('theme'), а не системная prefers-color-scheme. Статический
// themeColor через media красил бы статус-бар PWA по теме СИСТЕМЫ, а не
// кабинета (белая полоса над тёмным приложением). Мета-тег ставится
// динамически: themeInitScript ниже + переключатель темы (ThemeToggle).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Скрипт применяется ДО первого рендера — предотвращает мигание белым фоном
// при загрузке ночной темы. Заодно ставит <meta name="theme-color"> в тон
// выбранной темы (статус-бар standalone-PWA); тег создаётся при отсутствии.
const themeInitScript = `
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark') document.documentElement.classList.add('dark');
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'theme-color'); document.head.appendChild(m); }
    m.setAttribute('content', t === 'dark' ? '#000000' : '#ffffff');
  } catch(_) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: themeInitScript вешает .dark на <html> до гидрации —
    // расхождение className сервер/клиент ожидаемое
    <html lang="ru" suppressHydrationWarning className={`h-full antialiased ${scriptFontVars}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
