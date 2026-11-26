import Link from "next/link";
import { QuickIdeaForm } from "@/components/project-forms";
import { StatusButtons } from "@/components/status-buttons";
import { Card } from "@/components/ui/card";
import { STATUS_LABEL } from "@/lib/labels";
import { requireMember } from "@/server/session";
import type { ProjectStatus } from "@/domain/types";

export default async function QueuePage() {
  const { supabase, user, member } = await requireMember();
  if (!member) return null;
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, visibility")
    .eq("owner_id", user.id)
    .in("status", ["fila", "pausado"])
    .order("position");
  return (
    <div className="grid gap-5">
      <div className="flex items-end justify-between">
        <h1 className="font-serif text-3xl">Fila</h1>
        <Link href="/app/projetos/novo" className="text-sm underline">
          Novo
        </Link>
      </div>
      {(projects ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nada esperando.</p> : null}
      {(projects ?? []).map((project) => (
        <Card key={project.id} className="grid gap-3">
          <div>
            <Link href={`/app/projetos/${project.id}`} className="font-serif text-2xl">
              {project.title}
            </Link>
            <p className="text-sm text-muted-foreground">
              {STATUS_LABEL[project.status as ProjectStatus]} · {project.visibility === "compartilhado" ? "compartilhado" : "privado"}
            </p>
          </div>
          <StatusButtons projectId={project.id} status={project.status} />
        </Card>
      ))}
      <QuickIdeaForm />
    </div>
  );
}
