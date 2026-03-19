import { createClient } from "jsr:@supabase/supabase-js@2";

const PAIR_LIMIT_FREE = 1;
const PAIR_LIMIT_PREMIUM = 5;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Admin client for privileged operations (pair count check across both sides)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Get or create the public user row (admin bypasses RLS)
    const { data: upsertedUser, error: upsertError } = await adminClient
      .from("users")
      .upsert(
        { auth_id: user.id, username: "" },
        { onConflict: "auth_id", ignoreDuplicates: true },
      )
      .select("id, is_premium")
      .maybeSingle();

    const publicUser =
      upsertedUser ??
      (await (async () => {
        const { data } = await adminClient
          .from("users")
          .select("id, is_premium")
          .eq("auth_id", user.id)
          .single();
        return data;
      })());

    if (!publicUser) {
      console.error("[create-invitation] upsertError:", upsertError);
      return json({ error: "Failed to create user profile" }, 500);
    }

    // Count existing pairs for this user
    const { count: pairCount, error: pairError } = await adminClient
      .from("pairs")
      .select("id", { count: "exact", head: true })
      .or(`user_a_id.eq.${publicUser.id},user_b_id.eq.${publicUser.id}`);

    if (pairError) {
      return json({ error: "Failed to count pairs" }, 500);
    }

    const limit = publicUser.is_premium ? PAIR_LIMIT_PREMIUM : PAIR_LIMIT_FREE;
    if ((pairCount ?? 0) >= limit) {
      return json(
        { error: "pair_limit_reached", isPremium: publicUser.is_premium },
        403,
      );
    }

    // Check for an already pending invitation from this user
    const { data: existingInvite } = await adminClient
      .from("invitations")
      .select("token, expires_at")
      .eq("inviter_id", publicUser.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existingInvite) {
      const deepLink = `portelio://invite/${existingInvite.token}`;
      return json({ token: existingInvite.token, deepLink });
    }

    // Create a new invitation
    const { data: invitation, error: inviteError } = await adminClient
      .from("invitations")
      .insert({ inviter_id: publicUser.id })
      .select("token")
      .single();

    if (inviteError || !invitation) {
      return json({ error: "Failed to create invitation" }, 500);
    }

    const deepLink = `portelio://invite/${invitation.token}`;
    return json({ token: invitation.token, deepLink });
  } catch (err) {
    console.error("[create-invitation] unexpected error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
