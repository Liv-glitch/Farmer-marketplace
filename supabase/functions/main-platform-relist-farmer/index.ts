import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authorizeMainPlatform,
  mainPlatformCorsHeaders,
  mainPlatformJson,
  postMainPlatformCallback,
  validateMainPlatformFarmerRelist,
} from "../_shared/main-platform.ts";
import { getEstimatedHarvestDate } from "../external-get-farmers/harvest.ts";

const hasFutureHarvest = (plantingDate: string, variety: string | null | undefined) => {
  const harvestDate = getEstimatedHarvestDate(plantingDate, variety ?? null);
  return Boolean(harvestDate && harvestDate > new Date().toISOString().slice(0, 10));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: mainPlatformCorsHeaders });
  if (req.method !== "POST") return mainPlatformJson(405, { status: 405, code: "method_not_allowed", message: "Method not allowed" });
  if (!authorizeMainPlatform(req)) return mainPlatformJson(401, { status: 401, code: "unauthorized", message: "Unauthorized" });

  try {
    const body = await req.json().catch(() => null);
    if (!body) return mainPlatformJson(400, { status: 400, code: "invalid_json", message: "Invalid JSON body" });

    const validated = validateMainPlatformFarmerRelist(body);
    if (!validated.ok) return mainPlatformJson(validated.status, { status: validated.status, code: "invalid_request", message: validated.message });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: farmer, error: farmerErr } = await supabase
      .from("farmers")
      .select("id, farmer_id, registration_status, listing_status, potato_variety, external_callback_url")
      .eq("farmer_id", validated.data.farmer_id)
      .maybeSingle();
    if (farmerErr) throw farmerErr;
    if (!farmer) return mainPlatformJson(404, { status: 404, code: "farmer_not_found", message: "Farmer not found" });
    if (farmer.registration_status !== "approved") {
      return mainPlatformJson(409, { status: 409, code: "farmer_not_approved", message: "Only approved farmers can be relisted" });
    }
    if (farmer.listing_status !== "harvested") {
      return mainPlatformJson(409, { status: 409, code: "invalid_listing_state", message: "Only harvested listings can be relisted" });
    }
    if (!hasFutureHarvest(validated.data.planting_date, farmer.potato_variety)) {
      return mainPlatformJson(400, { status: 400, code: "invalid_request", message: "New planting date must produce a future harvest date" });
    }

    const { data: updated, error } = await supabase
      .from("farmers")
      .update({ planting_date: validated.data.planting_date, listing_status: "available" })
      .eq("id", farmer.id)
      .eq("listing_status", "harvested")
      .select("farmer_id, planting_date, potato_variety, listing_status")
      .single();
    if (error) throw error;

    const estimatedHarvestDate = getEstimatedHarvestDate(updated.planting_date, updated.potato_variety);
    await postMainPlatformCallback(farmer.external_callback_url, {
      event: "farmer_relisted",
      data: {
        farmer_id: updated.farmer_id,
        listing_status: updated.listing_status,
        planting_date: updated.planting_date,
        estimated_harvest_date: estimatedHarvestDate,
      },
    });

    return mainPlatformJson(200, {
      status: 200,
      data: {
        farmer_id: updated.farmer_id,
        listing_status: updated.listing_status,
        planting_date: updated.planting_date,
        estimated_harvest_date: estimatedHarvestDate,
        message: "Farmer listing has been listed again",
      },
    });
  } catch (err) {
    console.error("main-platform-relist-farmer error:", err);
    return mainPlatformJson(500, { status: 500, code: "internal_error", message: "Internal server error" });
  }
});
