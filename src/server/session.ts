import { redirect } from "next/navigation";
import { teamFromMetadata } from "@/server/auth-messages";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, user: data.user };
}

export async function requireMember() {
  const { supabase, user } = await requireUser();
  let { data: member } = await supabase.from("team_members").select("*").eq("user_id", user.id).maybeSingle();
  if (!member) {
    const fromMetadata = teamFromMetadata(user.user_metadata);
    if (fromMetadata) {
      await supabase.rpc("create_team", { p_name: fromMetadata.teamName, p_display_name: fromMetadata.displayName });
      member = (await supabase.from("team_members").select("*").eq("user_id", user.id).maybeSingle()).data;
    }
  }
  if (!member) return { supabase, user, member: null, team: null };
  const { data: team } = await supabase.from("teams").select("*").eq("id", member.team_id).maybeSingle();
  return { supabase, user, member, team };
}
