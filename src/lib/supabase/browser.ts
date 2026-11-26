import { createBrowserClient } from "@supabase/ssr";

export function createBrowserClientSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("CONFIG");
  }
  return createBrowserClient(url, key);
}
