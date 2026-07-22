import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260722120000_add_buyer_promo_codes.sql", "utf8");

describe("buyer promo code migration", () => {
  it("creates single-use promo codes for buyers", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.buyer_promo_codes");
    expect(migration).toContain("buyer_id uuid NOT NULL REFERENCES public.buyers(id)");
    expect(migration).toContain("used_booking_id uuid REFERENCES public.bookings(id)");
    expect(migration).toContain("status text NOT NULL DEFAULT 'active'");
  });

  it("prevents more than one active promo per buyer", () => {
    expect(migration).toContain("buyer_promo_codes_one_active_per_buyer");
    expect(migration).toContain("WHERE status = 'active'");
  });
});
