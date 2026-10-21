// Copied from gc3274/hw1@3eb3337 lib/supabase/env.ts; keep in sync
// Reference NEXT_PUBLIC_* literally so Next inlines them into client bundles.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export const SUPABASE_URL = url;
export const SUPABASE_PUBLISHABLE_KEY = key;

// Admin only: its own auth cookie, so the main app on localhost:3000 and the
// admin on :3001 never share a session (cookies ignore the port).
export const AUTH_COOKIE_NAME = "sb-admin-auth-token";
