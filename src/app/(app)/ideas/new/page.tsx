import { prisma } from "@/lib/prisma";
import { IdeaForm } from "@/components/ideas/idea-form";

export default async function NewIdeaPage() {
  const ideas = await prisma.idea.findMany({ select: { tags: true } });
  const allTags = Array.from(new Set(ideas.flatMap((i) => i.tags))).sort();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Новая идея</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <IdeaForm existingTags={allTags} />
      </div>
    </div>
  );
}
