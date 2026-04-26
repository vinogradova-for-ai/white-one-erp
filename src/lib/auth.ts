import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user || !user.isActive) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id: string }).id;
        token.role = (user as { role: Role }).role;
      }
      // Проверяем, что юзер из токена существует в БД.
      // Если БД пересоздавалась (миграции) — ID в токене может быть устаревшим.
      if (token.userId) {
        const exists = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { id: true, isActive: true, role: true },
        });
        if (!exists || !exists.isActive) {
          // Возвращаем пустой токен — пользователя отправит на логин
          return {};
        }
        // Если роль в БД изменилась — обновим в токене
        token.role = exists.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as { id?: string }).id = token.userId as string;
        (session.user as { role?: Role }).role = token.role as Role;
      }
      return session;
    },
  },
});
