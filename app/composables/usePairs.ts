import { ref } from "vue";

let supabaseInstance: any = null;
async function getSupabase() {
  if (!supabaseInstance) {
    const { supabase } = await import("../lib/supabase");
    supabaseInstance = supabase;
  }
  return supabaseInstance;
}

export interface Partner {
  id: string;
  username: string;
}

export interface LastPhoto {
  id: string;
  storagePath: string;
  caption: string | null;
  sentAt: string;
}

export interface Pair {
  id: string;
  partner: Partner;
  lastPhotoReceived: LastPhoto | null;
  lastPhotoSent: LastPhoto | null;
  createdAt: string;
}

export interface CreateInvitationResult {
  token: string;
  deepLink: string;
}

export function usePairs() {
  const pairs = ref<Pair[]>([]);
  const isLoading = ref(false);
  const error = ref<Error | null>(null);

  async function fetchPairs(): Promise<void> {
    isLoading.value = true;
    error.value = null;

    try {
      const supabase = await getSupabase();

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");
      const user = session.user;

      const { data: me, error: meError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_id", user.id)
        .single();

      if (meError || !me) throw new Error("User profile not found");

      // Fetch pairs with partner info
      const { data: rawPairs, error: pairsError } = await supabase
        .from("pairs")
        .select(
          `
          id,
          created_at,
          user_a_id,
          user_b_id,
          user_a:users!pairs_user_a_id_fkey(id, username),
          user_b:users!pairs_user_b_id_fkey(id, username)
        `,
        )
        .or(`user_a_id.eq.${me.id},user_b_id.eq.${me.id}`)
        .order("created_at", { ascending: false });

      if (pairsError) throw pairsError;

      const result: Pair[] = await Promise.all(
        (rawPairs ?? []).map(async (p: any) => {
          const partner: Partner =
            p.user_a_id === me.id
              ? { id: p.user_b.id, username: p.user_b.username }
              : { id: p.user_a.id, username: p.user_a.username };

          // Last photo received (sent by partner)
          const { data: received } = await supabase
            .from("photos")
            .select("id, storage_path, caption, sent_at")
            .eq("pair_id", p.id)
            .eq("sender_id", partner.id)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          // Last photo sent (sent by me)
          const { data: sent } = await supabase
            .from("photos")
            .select("id, storage_path, caption, sent_at")
            .eq("pair_id", p.id)
            .eq("sender_id", me.id)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            id: p.id,
            partner,
            createdAt: p.created_at,
            lastPhotoReceived: received
              ? {
                  id: received.id,
                  storagePath: received.storage_path,
                  caption: received.caption,
                  sentAt: received.sent_at,
                }
              : null,
            lastPhotoSent: sent
              ? {
                  id: sent.id,
                  storagePath: sent.storage_path,
                  caption: sent.caption,
                  sentAt: sent.sent_at,
                }
              : null,
          };
        }),
      );

      pairs.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e : new Error("Failed to fetch pairs");
      console.error("[usePairs] fetchPairs failed:", error.value);
    } finally {
      isLoading.value = false;
    }
  }

  async function createInvitation(): Promise<CreateInvitationResult> {
    const supabase = await getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-invitation`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const body = await res.json();

    if (!res.ok) {
      const code = body?.error ?? "unknown_error";
      throw Object.assign(new Error(code), { code });
    }

    return { token: body.token, deepLink: body.deepLink };
  }

  async function acceptInvitation(token: string): Promise<{ pairId: string }> {
    const supabase = await getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-invitation`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      },
    );

    const body = await res.json();

    if (!res.ok) {
      const code = body?.error ?? "unknown_error";
      throw Object.assign(new Error(code), { code });
    }

    return { pairId: body.pairId };
  }

  return {
    pairs,
    isLoading,
    error,
    fetchPairs,
    createInvitation,
    acceptInvitation,
  };
}
