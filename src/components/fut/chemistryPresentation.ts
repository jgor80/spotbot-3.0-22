export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function firstField(value: Record<string, unknown>, keys: string[]) {
  const key = keys.find(key => value[key] !== undefined && value[key] !== null);
  return key ? { key, value: value[key] } : undefined;
}
export function remainingFields(value: Record<string, unknown>, used: string[]) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !used.includes(key)));
}
export function swapLine(value: unknown, fallbackName?: string) {
  const row = record(value);
  if (!row) return undefined;
  const name = firstField(row, ["name_after", "name", "player_name", "name_before"]);
  const before = firstField(row, ["before", "chemistry_before"]);
  const after = firstField(row, ["after", "chemistry_after"]);
  const delta = firstField(row, ["delta", "change", "chemistry_delta"]);
  if (typeof before?.value !== "number" || typeof after?.value !== "number") return undefined;
  const playerName = typeof name?.value === "string" ? name.value : fallbackName ?? (typeof row.slot === "string" ? row.slot : undefined);
  if (!playerName) return undefined;
  // Delta is displayed only when supplied by the API; never recompute chemistry in the browser.
  const signed = typeof delta?.value === "number" ? `${delta.value >= 0 ? "+" : ""}${delta.value}` : undefined;
  return {
    name: playerName, before: before.value, after: after.value, signed,
    extra: remainingFields(row, [name?.key ?? "", before.key, after.key, ...(signed ? [delta?.key ?? ""] : []), "slot"]),
  };
}
export function linkLine(value: unknown, kind?: string) {
  const row = record(value);
  if (!row) return undefined;
  const type = firstField(row, ["type", "kind", "category"]);
  const category = typeof type?.value === "string" ? type.value : kind;
  if (!category || !["club", "league", "nation"].includes(category.toLowerCase())) return undefined;
  const count = firstField(row, ["count", "effective_count", "current_count"]);
  if (typeof count?.value !== "number") return undefined;
  const name = firstField(row, ["name", "label", "value"]);
  const needed = firstField(row, ["needed_for_next", "needed_for_next_point", "needed", "missing", "remaining"]);
  const threshold = firstField(row, ["next_threshold", "next_point_at", "next_count", "threshold"]);
  const explanation = firstField(row, ["explanation", "next_point", "requirement"]);
  return {
    category: category[0].toUpperCase() + category.slice(1), name: name?.value, count: count.value,
    needed: needed?.value, threshold: threshold?.value, explanation: explanation?.value,
    extra: remainingFields(row, [type?.key ?? "", count.key, name?.key ?? "", needed?.key ?? "", threshold?.key ?? "", explanation?.key ?? ""]),
  };
}
