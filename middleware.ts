import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// manifest.webmanifest — публичный: браузер/установленная PWA тянет манифест
// без кук, иначе «на экран домой» ловит редирект на /login.
// /api/external — служебный вход Студии, защищён своим Bearer-токеном внутри роута.
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/external", "/_next", "/favicon.ico", "/manifest.webmanifest"];

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
