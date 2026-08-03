import { createClient } from "npm:@supabase/supabase-js@2";
import { getEstimatedHarvestDate, isHarvestDue, todayIsoDate } from "../external-get-farmers/harvest.ts";
import { postMainPlatformCallback } from "../_shared/main-platform.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const authorize = (req: Request) => {
  const expectedSecret = Deno.env.get("HARVEST_CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  return Boolean(expectedSecret && providedSecret && providedSecret === expectedSecret);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { status: 405, message: "Method not allowed" });
  if (!authorize(req)) return json(401, { status: 401, message: "Unauthorized" });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const asOf = todayIsoDate();

    const { data: farmers, error: lookupErr } = await supabase
      .from("farmers")
      .select("id, farmer_id, planting_date, potato_variety, external_callback_url")
      .eq("registration_status", "approved")
      .eq("listing_status", "available");

    if (lookupErr) {
      console.error("Harvest lookup error:", lookupErr);
      return json(500, { status: 500, message: "Internal server error" });
    }

    let harvested = 0;
    const callbackFailures: string[] = [];

    for (const farmer of farmers || []) {
      if (!isHarvestDue(farmer, asOf)) continue;

      const { data: updated, error: updateErr } = await supabase
        .from("farmers")
        .update({ listing_status: "harvested" })
        .eq("id", farmer.id)
        .eq("listing_status", "available")
        .select("id")
        .maybeSingle();

      if (updateErr) {
        console.error("Harvest update error:", updateErr, { farmer_id: farmer.farmer_id });
        continue;
      }
      if (!updated) continue;

      harvested += 1;

      const callback = await postMainPlatformCallback(farmer.external_callback_url, {
        event: "farmer_harvested",
        data: {
          farmer_id: farmer.farmer_id,
          listing_status: "harvested",
          planting_date: farmer.planting_date,
          estimated_harvest_date: getEstimatedHarvestDate(farmer.planting_date, farmer.potato_variety),
          message: "Farmer listing was delisted because the estimated harvest date was reached.",
        },
      });
      if (!callback.delivered && !callback.skipped) callbackFailures.push(String(farmer.farmer_id || farmer.id));
    }

    return json(200, {
      status: 200,
      data: {
        as_of: asOf,
        harvested,
        callback_failures: callbackFailures,
      },
    });
  } catch (err) {
    console.error("Harvest cron unexpected error:", err);
    return json(500, { status: 500, message: "Internal server error" });
  }
});
