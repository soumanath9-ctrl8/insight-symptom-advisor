/**
 * Supabase environment configuration for server-side code.
 *
 * Lovable/Supabase projects can expose the public Supabase credentials
 * through either VITE_* variables or server-side SUPABASE_* variables.
 *
 * The publishable key is safe to use from the browser.
 * Never put a Supabase service-role/secret key in client code.
 */

function readEnv(name: string): string {
  // Vite replaces import.meta.env values at build time.
  const viteValue =
    typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined>)[name]
      : undefined;

  if (viteValue) return viteValue;

  // TanStack Start/server runtime may expose process.env.
  if (typeof process !== "undefined") {
    const processValue = process.env[name];

    if (processValue) return processValue;
  }

  return "";
}

export function getSupabaseServerConfig() {
  const url =
    readEnv("SUPABASE_URL") ||
    readEnv("VITE_SUPABASE_URL");

  const publishableKey =
    readEnv("SUPABASE_PUBLISHABLE_KEY") ||
    readEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

  return {
    url,
    publishableKey,
    configured: Boolean(url && publishableKey),
  };
}

export function requireSupabaseServerConfig() {
  const config = getSupabaseServerConfig();

  if (!config.configured) {
    throw new Error(
      [
        "Supabase server configuration is missing.",
        "",
        "Required:",
        "SUPABASE_URL or VITE_SUPABASE_URL",
        "SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_PUBLISHABLE_KEY",
        "",
        "Connect Supabase in Lovable Cloud.",
      ].join("\n"),
    );
  }

  return config;
}