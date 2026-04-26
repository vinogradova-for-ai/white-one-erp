import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PackagingForm } from "@/components/packaging/packaging-form";

export default async function NewPackagingPage() {
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Новая карточка упаковки</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <PackagingForm users={users} defaultOwnerId={currentUserId} />
      </div>
    </div>
  );
}
