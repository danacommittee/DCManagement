import type { LeftoverContainerType } from "@/types";

export const LEFTOVER_CONTAINER_TYPES: { id: LeftoverContainerType; label: string }[] = [
  { id: "full_aluminum_tray", label: "Full size Aluminum trays" },
  { id: "half_aluminum_tray", label: "Half size Aluminium trays" },
  { id: "bucket_5gal", label: "5 gallon Buckets" },
  { id: "container_16oz", label: "16 oz containers" },
  { id: "container_24oz", label: "24 oz containers" },
  { id: "container_32oz", label: "32 oz containers" },
  { id: "crate", label: "Crates" },
];

export function leftoverContainerLabel(type: LeftoverContainerType): string {
  return LEFTOVER_CONTAINER_TYPES.find((c) => c.id === type)?.label ?? type;
}
