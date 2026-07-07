import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260707120000_add_farmer_accounts.sql", "utf8");

describe("farmer account migration", () => {
  it("adds an account table keyed by normalized email", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.farmer_accounts");
    expect(migration).toContain("email TEXT UNIQUE NOT NULL");
    expect(migration).toContain("lower(trim(email)) AS email");
  });

  it("links existing farmer rows to shared accounts by email", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS farmer_account_id UUID REFERENCES public.farmer_accounts(id)");
    expect(migration).toContain("UPDATE public.farmers f");
    expect(migration).toContain("lower(trim(f.email)) = fa.email");
    expect(migration).toContain("farmers_farmer_account_id_idx");
  });
});
