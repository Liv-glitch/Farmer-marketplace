import { addDays } from "date-fns";
import { HARVEST_DAYS } from "@/data/kenyaLocations";

export const getEstimatedHarvest = (plantingDate: string, variety: string | null | undefined) => {
  const days = HARVEST_DAYS[variety || ""] || 100;
  return addDays(new Date(plantingDate), days);
};

export const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export const getEstimatedHarvestIso = (plantingDate: string | null | undefined, variety: string | null | undefined) => {
  if (!plantingDate) return null;
  const harvest = getEstimatedHarvest(plantingDate, variety);
  if (Number.isNaN(harvest.getTime())) return null;
  return harvest.toISOString().slice(0, 10);
};

export const isHarvestDue = (plantingDate: string | null | undefined, variety: string | null | undefined) => {
  const harvestIso = getEstimatedHarvestIso(plantingDate, variety);
  return Boolean(harvestIso && harvestIso <= todayIsoDate());
};
