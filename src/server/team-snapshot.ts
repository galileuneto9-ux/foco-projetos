import { initials, memberStatusLine, scoreboard, sharedPoints } from "@/domain/redesign";
import { weekStartSaoPaulo } from "@/domain/time";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamPerson = {
  userId: string;
  name: string;
  initials: string;
  line: string;
  points: number;
};

type TaskRow = {
  assignee_id: string;
  status: string;
  due_date: string | null;
  title: string;
  id: string;
  visibility: string | null;
};

export async function loadTeamColumn(supabase: SupabaseClient, teamId: string, today: string) {
  const { data: members } = await supabase.from("team_members").select("user_id, display_name").eq("team_id", teamId);
  const { data: projects } = await supabase.from("projects").select("id").eq("visibility", "compartilhado");
  const sharedIds = (projects ?? []).map((project) => project.id as string);
  const { data: projectTasks } = sharedIds.length
    ? await supabase.from("tasks").select("id, assignee_id, status, due_date, title, visibility").in("project_id", sharedIds)
    : { data: [] as TaskRow[] };
  const { data: loose } = await supabase
    .from("tasks")
    .select("id, assignee_id, status, due_date, title, visibility")
    .is("project_id", null)
    .eq("visibility", "compartilhado");
  const shared = [...(projectTasks ?? []), ...(loose ?? [])] as TaskRow[];
  const week = weekStartSaoPaulo(new Date());
  const { data: events } = await supabase.from("point_events").select("user_id, points, visibility, week_start");
  const totals = sharedPoints(
    (events ?? []).map((event) => ({
      userId: event.user_id as string,
      points: event.points as number,
      visibility: event.visibility as string,
      weekStart: String(event.week_start).slice(0, 10),
    })),
    week,
  );
  const people: TeamPerson[] = (members ?? [])
    .map((member) => {
      const name = member.display_name as string;
      const mine = shared.filter((task) => task.assignee_id === member.user_id);
      return {
        userId: member.user_id as string,
        name,
        initials: initials(name),
        line: memberStatusLine(
          mine.map((task) => ({ due: task.due_date, status: task.status })),
          today,
        ),
        points: totals.get(member.user_id as string) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
  return {
    people,
    ranked: scoreboard(people),
    loose: shared.filter((task) => task.visibility === "compartilhado" && task.title).map((task) => ({ id: task.id, title: task.title })),
  };
}
