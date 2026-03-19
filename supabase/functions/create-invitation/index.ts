import { createClient } from "jsr:@supabase/supabase-js@2";

const PAIR_LIMIT_FREE = 1;
const PAIR_LIMIT_PREMIUM = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json(
        { error: "Missing authorization header" },
        { status: 401 },
      );
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
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the public user row
    const { data: publicUser, error: userError } = await supabase
      .from("users")
      .select("id, is_premium")
      .eq("auth_id", user.id)
      .single();

    if (userError || !publicUser) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    // Count existing pairs for this user
    const { count: pairCount, error: pairError } = await adminClient
      .from("pairs")
      .select("id", { count: "exact", head: true })
      .or(`user_a_id.eq.${publicUser.id},user_b_id.eq.${publicUser.id}`);

    if (pairError) {
      return Response.json({ error: "Failed to count pairs" }, { status: 500 });
    }

    const limit = publicUser.is_premium ? PAIR_LIMIT_PREMIUM : PAIR_LIMIT_FREE;
    if ((pairCount ?? 0) >= limit) {
      return Response.json(
        { error: "pair_limit_reached", isPremium: publicUser.is_premium },
        { status: 403 },
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
      return Response.json({ token: existingInvite.token, deepLink });
    }

    // Create a new invitation
    const { data: invitation, error: inviteError } = await adminClient
      .from("invitations")
      .insert({ inviter_id: publicUser.id })
      .select("token")
      .single();

    if (inviteError || !invitation) {
      return Response.json(
        { error: "Failed to create invitation" },
        { status: 500 },
      );
    }

    const deepLink = `portelio://invite/${invitation.token}`;
    return Response.json({ token: invitation.token, deepLink });
  } catch (err) {
    console.error("[create-invitation] unexpected error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
});
