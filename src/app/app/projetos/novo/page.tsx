import { ProjectEditor } from "@/components/project-forms";

export default function NewProjectPage() {
  return (
    <div className="grid gap-5">
      <h1 className="font-serif text-3xl">Novo projeto</h1>
      <p className="text-sm text-muted-foreground">Ele nasce na fila e privado.</p>
      <ProjectEditor
        values={{ title: "", brief: "", visibility: "privado", priority: "medio", dueDate: "", nextMilestone: "", nextMilestoneOn: "", chargeOn: "" }}
      />
    </div>
  );
}
