import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ImportClient } from "@/components/gantt-v2/import-client";

export default async function ImportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/gantt-v2");
  return <ImportClient />;
}
