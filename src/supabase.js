import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_URL = supabaseUrl || "";
export const SUPABASE_FUNCTIONS_URL = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1` : "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️ Missing Supabase environment variables.");
}

export const supabase = createClient(
  supabaseUrl || "",
  supabaseAnonKey || ""
);
