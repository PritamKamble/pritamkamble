import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("SITE_URL") || "https://pritamkamble.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const jwt = authHeader.replace("Bearer ", "");

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: callerData, error: callerError } = await anonClient.auth.getUser(jwt);
  if (callerError || !callerData?.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", callerData.user.id)
    .single();

  if (callerProfile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden - admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const body = await req.json().catch(() => null);
  const email = body?.email?.trim();
  const fullName = body?.full_name?.trim();
  if (!email || !fullName) {
    return new Response(JSON.stringify({ error: "email and full_name are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role: "candidate", full_name: fullName },
    redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent("/candidate")}`,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ success: true, user_id: data.user?.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
