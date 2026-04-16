import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/products/product-form";

export default async function NewProductPage() {
  const [users, factories] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["OWNER", "DIRECTOR", "PRODUCT_MANAGER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.factory.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Новое изделие</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ProductForm users={users} factories={factories} />
      </div>
    </div>
  );
}
