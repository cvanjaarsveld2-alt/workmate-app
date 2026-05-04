import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://hrqzqyvfbzfrfnuxovvr.supabase.co";
const supabaseKey = "sb_publishable_ZAA9TAKKvXwyEpF7EGWM7g_Nwhk5Qni";

export const supabase = createClient(supabaseUrl, supabaseKey);
