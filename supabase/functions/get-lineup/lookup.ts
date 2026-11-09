// How get-lineup finds a lineup, and whether the caller must prove server access.
// An ID lookup always needs access to the lineup's server. Only a lookup by the share code
// itself is public, because the code is the secret. Sending a share_code alongside an ID must
// not skip the access check.
export type LineupLookup =
  | { by: "id"; value: string; needsAccess: true }
  | { by: "share_code"; value: string; needsAccess: false };

export function lineupLookup(body: { lineup_id?: unknown; share_code?: unknown }): LineupLookup | null {
  const id = typeof body.lineup_id === "string" ? body.lineup_id.trim() : "";
  const code = typeof body.share_code === "string" ? body.share_code.trim() : "";
  if (id) return { by: "id", value: id, needsAccess: true };
  if (code) return { by: "share_code", value: code, needsAccess: false };
  return null;
}
