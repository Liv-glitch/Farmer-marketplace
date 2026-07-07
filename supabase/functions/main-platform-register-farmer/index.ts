import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authorizeMainPlatform,
  mainPlatformCorsHeaders,
  mainPlatformJson,
  postMainPlatformCallback,
  validateMainPlatformFarmerRegistration,
} from "../_shared/main-platform.ts";

const ensureFarmerAccount = async (
  supabase: ReturnType<typeof createClient>,
  account: { email: string; full_name?: string | null; phone_number?: string | null },
) => {
  const normalizedEmail = account.email.trim().toLowerCase();
  const { data: existing, error: existingErr } = await supabase
    .from("farmer_accounts")
    .select("id,email,full_name,phone_number")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) {
    const updates: Record<string, unknown> = {};
    if (!existing.full_name && account.full_name) updates.full_name = account.full_name;
    if (!existing.phone_number && account.phone_number) updates.phone_number = account.phone_number;
    if (Object.keys(updates).length > 0) {
      const { data: updated, error: updateErr } = await supabase
        .from("farmer_accounts")
        .update(updates)
        .eq("id", existing.id)
        .select("id,email,full_name,phone_number")
        .single();
      if (updateErr) throw updateErr;
      return updated;
    }
    return existing;
  }

  const { data: created, error } = await supabase
    .from("farmer_accounts")
    .insert({
      email: normalizedEmail,
      full_name: account.full_name ?? null,
      phone_number: account.phone_number ?? null,
    })
    .select("id,email,full_name,phone_number")
    .single();
  if (error) throw error;
  return created;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: mainPlatformCorsHeaders });
  if (req.method !== "POST") return mainPlatformJson(405, { status: 405, code: "method_not_allowed", message: "Method not allowed" });
  if (!authorizeMainPlatform(req)) return mainPlatformJson(401, { status: 401, code: "unauthorized", message: "Unauthorized" });

  try {
    const body = await req.json().catch(() => null);
    if (!body) return mainPlatformJson(400, { status: 400, code: "invalid_json", message: "Invalid JSON body" });

    const validated = validateMainPlatformFarmerRegistration(body);
    if (!validated.ok) return mainPlatformJson(validated.status, { status: validated.status, code: "invalid_request", message: validated.message });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (validated.data.external_platform_ref) {
      const { data: existing, error: existingErr } = await supabase
        .from("farmers")
        .select("farmer_id, registration_status, listing_status, external_platform_ref")
        .eq("external_platform_ref", validated.data.external_platform_ref)
        .maybeSingle();
      if (existingErr) throw existingErr;
      if (existing) {
        return mainPlatformJson(200, {
          status: 200,
          data: {
            farmer_id: existing.farmer_id,
            external_platform_ref: existing.external_platform_ref,
            registration_status: existing.registration_status,
            listing_status: existing.listing_status,
            message: "Farmer already registered",
          },
        });
      }
    }

    const farmerAccount = validated.data.email
      ? await ensureFarmerAccount(supabase, {
        email: validated.data.email,
        full_name: validated.data.full_name,
        phone_number: validated.data.phone_number,
      })
      : null;

    const { data: farmer, error } = await supabase
      .from("farmers")
      .insert({
        full_name: validated.data.full_name,
        phone_number: validated.data.phone_number,
        email: validated.data.email,
        farmer_account_id: farmerAccount?.id ?? null,
        county: validated.data.county,
        ward: validated.data.ward,
        specific_location: validated.data.specific_location,
        potato_variety: validated.data.potato_variety,
        acreage_planted: validated.data.acreage_planted,
        planting_date: validated.data.planting_date,
        payment_status: "promo_code",
        registration_status: "pending",
        listing_status: "pending_approval",
        registration_fee: 0,
        external_platform_ref: validated.data.external_platform_ref,
        external_callback_url: validated.data.callback_url,
      })
      .select("farmer_id, registration_status, listing_status, external_platform_ref, external_callback_url")
      .single();

    if (error || !farmer) throw error;

    await postMainPlatformCallback(farmer.external_callback_url, {
      event: "farmer_registered",
      data: {
        farmer_id: farmer.farmer_id,
        external_platform_ref: farmer.external_platform_ref,
        registration_status: farmer.registration_status,
        listing_status: farmer.listing_status,
      },
    });

    return mainPlatformJson(201, {
      status: 201,
      data: {
        farmer_id: farmer.farmer_id,
        external_platform_ref: farmer.external_platform_ref,
        registration_status: farmer.registration_status,
        listing_status: farmer.listing_status,
        message: "Farmer registration received and is pending approval",
      },
    });
  } catch (err) {
    console.error("main-platform-register-farmer error:", err);
    return mainPlatformJson(500, { status: 500, code: "internal_error", message: "Internal server error" });
  }
});
