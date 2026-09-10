import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ??
  import.meta.env.SUPABASE_URL ??
  "";

const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.SUPABASE_PUBLISHABLE_KEY ??
  "";

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    "Supabase configuration is missing. " +
      "Connect Supabase in Lovable Cloud and make sure " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are available.",
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabasePublishableKey || "placeholder-publishable-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);