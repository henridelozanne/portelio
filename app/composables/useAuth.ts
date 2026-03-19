import { ref } from "vue";

// Lazy import to avoid SSR/process issues on the client
let supabaseInstance: any = null;

async function getSupabase() {
  if (!supabaseInstance) {
    const { supabase } = await import("../lib/supabase");
    supabaseInstance = supabase;
  }
  return supabaseInstance;
}

// Ensure a row exists in public.users for the given auth user id.
// Uses upsert so it's safe to call on every app start.
async function ensurePublicUser(
  supabase: any,
  authUserId: string,
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .upsert(
      { auth_id: authUserId, username: "" },
      { onConflict: "auth_id", ignoreDuplicates: true },
    );

  if (error) {
    console.error("[Auth] ensurePublicUser failed:", error);
  }
}

export function useAuth() {
  const userId = ref<string | null>(null);
  const isLoading = ref(false);
  const error = ref<Error | null>(null);

  async function initAuth() {
    isLoading.value = true;
    error.value = null;

    try {
      const supabase = await getSupabase();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        userId.value = session.user.id;
        await ensurePublicUser(supabase, session.user.id);
        return;
      }

      const {
        data: { user: serverUser },
      } = await supabase.auth.getUser();

      if (serverUser) {
        userId.value = serverUser.id;
        await ensurePublicUser(supabase, serverUser.id);
        return;
      }

      const {
        data: { user },
        error: signInError,
      } = await supabase.auth.signInAnonymously();

      if (signInError) throw signInError;
      if (!user?.id)
        throw new Error("Failed to get user ID after anonymous sign in");

      userId.value = user.id;
      await ensurePublicUser(supabase, user.id);
    } catch (e) {
      error.value = e instanceof Error ? e : new Error("Unknown auth error");
      console.error("[Auth] initAuth failed:", error.value);
    } finally {
      isLoading.value = false;
    }
  }

  async function getCurrentUserId(): Promise<string> {
    if (userId.value) return userId.value;

    try {
      const supabase = await getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.id) {
        userId.value = session.user.id;
        return session.user.id;
      }
    } catch (e) {
      console.error("[Auth] Failed to get session:", e);
    }

    await initAuth();
    if (!userId.value)
      throw new Error("Unable to resolve user ID after initAuth");
    return userId.value;
  }

  return {
    userId,
    isLoading,
    error,
    initAuth,
    getCurrentUserId,
  };
}
