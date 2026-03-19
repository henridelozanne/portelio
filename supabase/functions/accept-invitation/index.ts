import { createClient } from "jsr:@supabase/supabase-js@2";

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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get authenticated user (the one accepting)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return json({ error: "Missing or invalid token" }, 400);
    }

    // Sanitize: token should be a 32-char hex string
    if (!/^[a-f0-9]{32}$/.test(token)) {
      return json({ error: "Invalid token format" }, 400);
    }

    // Fetch the invitation
    const { data: invitation, error: inviteError } = await adminClient
      .from("invitations")
      .select("id, inviter_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (inviteError || !invitation) {
      return json({ error: "Invitation not found" }, 404);
    }

    if (invitation.status !== "pending") {
      return json({ error: "invitation_already_used" }, 409);
    }

    if (new Date(invitation.expires_at) < new Date()) {
      // Mark as expired
      await adminClient
        .from("invitations")
        .update({ status: "expired" })
        .eq("id", invitation.id);
      return json({ error: "invitation_expired" }, 410);
    }

    // Get the accepter's public user row
    const { data: accepter, error: accepterError } = await adminClient
      .from("users")
      .select("id")
      .eq("auth_id", user.id)
      .single();

    if (accepterError || !accepter) {
      return json({ error: "Accepter profile not found" }, 404);
    }

    // Prevent self-pairing
    if (accepter.id === invitation.inviter_id) {
      return json({ error: "Cannot pair with yourself" }, 400);
    }

    // Check if a pair already exists between these two users
    const { data: existingPair } = await adminClient
      .from("pairs")
      .select("id")
      .or(
        `and(user_a_id.eq.${invitation.inviter_id},user_b_id.eq.${accepter.id}),and(user_a_id.eq.${accepter.id},user_b_id.eq.${invitation.inviter_id})`,
      )
      .maybeSingle();

    if (existingPair) {
      return json({ error: "pair_already_exists" }, 409);
    }

    // Create the pair + mark invitation as accepted — atomically via DB transaction
    const { data: pair, error: pairError } = await adminClient
      .from("pairs")
      .insert({ user_a_id: invitation.inviter_id, user_b_id: accepter.id })
      .select("id")
      .single();

    if (pairError || !pair) {
      return json({ error: "Failed to create pair" }, 500);
    }

    const { error: updateError } = await adminClient
      .from("invitations")
      .update({ status: "accepted" })
      .eq("id", invitation.id);

    if (updateError) {
      console.error(
        "[accept-invitation] failed to mark invitation as accepted:",
        updateError,
      );
      // Pair is created, not critical — log but don't fail
    }

    return json({ pairId: pair.id });
  } catch (err) {
    console.error("[accept-invitation] unexpected error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
