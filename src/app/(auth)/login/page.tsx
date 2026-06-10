import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">White One ERP</h1>
          <p className="mt-1 text-sm text-slate-500">Вход в систему</p>
        </div>
        <Suspense fallback={<div className="py-8 text-center text-sm text-slate-400">Загрузка…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
