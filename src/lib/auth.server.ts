import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

import type { Database } from "@/integrations/supabase/types";

function authenticatedFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request
        ? input.headers
        : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Server-only compatibility helper used by the history functions restored from
 * GitHub. It authenticates the request and returns an RLS-scoped client.
 */
export async function requireSupabaseAuth() {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  const url = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response("Unauthorized", { status: 401 });
  }

  if (!url || !publishableKey) {
    throw new Error("The hosted backend is not configured.");
  }

  const token = authHeader.slice("Bearer ".length);
  const supabase = createClient<Database>(url, publishableKey, {
    global: {
      fetch: authenticatedFetch(publishableKey),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;

  if (error || !userId) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return {
    supabase,
    user: { id: userId },
  };
}