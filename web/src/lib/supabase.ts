import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getStoredSupabaseConfig(): { url: string; key: string } {
  if (typeof window === "undefined") {
    return {
      url: import.meta.env.VITE_SUPABASE_URL || "https://upxsggyqouyidrstouyi.supabase.co",
      key: import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_GmBN3k5nu04H_yaJn7uq5A_UQYgMp7_",
    };
  }
  const storedUrl = localStorage.getItem("rupeetrack_supabase_url");
  const storedKey = localStorage.getItem("rupeetrack_supabase_anon_key");
  return {
    url: storedUrl || import.meta.env.VITE_SUPABASE_URL || "https://upxsggyqouyidrstouyi.supabase.co",
    key: storedKey || import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_GmBN3k5nu04H_yaJn7uq5A_UQYgMp7_",
  };
}

export function saveStoredSupabaseConfig(url: string, key: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("rupeetrack_supabase_url", url.trim());
    localStorage.setItem("rupeetrack_supabase_anon_key", key.trim());
  }
  initSupabaseClient();
}

let clientInstance: SupabaseClient | null = null;

export function initSupabaseClient(): SupabaseClient {
  const { url, key } = getStoredSupabaseConfig();
  const validUrl = url && url.startsWith("http") ? url : "https://placeholder.supabase.co";
  const validKey = key || "placeholder-anon-key";

  clientInstance = createClient(validUrl, validKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return clientInstance;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!clientInstance) {
      initSupabaseClient();
    }
    const val = (clientInstance as any)[prop];
    return typeof val === "function" ? val.bind(clientInstance) : val;
  },
});

export default supabase;
