import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260803120000_add_harvested_listing_status.sql", "utf8");

describe("harvested listing status migration", () => {
  it("adds harvested to listing_status", () => {
    expect(migration).toContain("ALTER TYPE public.listing_status ADD VALUE IF NOT EXISTS 'harvested'");
  });
});
