// In-memory stand-in for the supabase-js query builder on the `fut` schema, for the XI Lab tests only.
// Supports the calls the FUT services make: select (with count/head), insert(...).select().single(),
// update, delete, eq, in, is, gte, lte, order, limit, range, maybeSingle, single.
type Row = Record<string, unknown>;

export function futMemoryDb(tables: Record<string, Row[]> = {}) {
  const t = (name: string) => (tables[name] ||= []);
  const calls: string[] = [];
  return {
    tables,
    calls,
    from(table: string) {
      calls.push(table);
      const filters: ((r: Row) => boolean)[] = [];
      let mode: "select" | "update" | "delete" = "select";
      let patch: Row = {};
      let head = false;
      let order: [string, boolean] | null = null;
      let lim = Infinity;
      let off = 0;
      const match = () => t(table).filter((r) => filters.every((f) => f(r)));
      const result = () => {
        if (mode === "update") {
          const rows = match();
          for (const r of rows) Object.assign(r, patch);
          return { data: rows.map((r) => ({ ...r })), error: null };
        }
        if (mode === "delete") {
          const gone = new Set(match());
          tables[table] = t(table).filter((r) => !gone.has(r));
          return { data: null, error: null };
        }
        let rows = match();
        if (order) {
          const [c, asc] = order;
          rows = [...rows].sort((a, b) => ((a[c] as number) > (b[c] as number) ? 1 : (a[c] as number) < (b[c] as number) ? -1 : 0) * (asc ? 1 : -1));
        }
        rows = rows.slice(off, off + lim);
        return head ? { data: null, count: rows.length, error: null } : { data: rows.map((r) => ({ ...r })), count: rows.length, error: null };
      };
      const q = {
        select: (_cols?: string, opts?: { head?: boolean }) => { if (opts?.head) head = true; return q; },
        insert: (row: Row | Row[]) => {
          const now = new Date().toISOString();
          const rows = (Array.isArray(row) ? row : [row]).map((r) => ({ id: crypto.randomUUID(), created_at: now, updated_at: now, ...r }));
          t(table).push(...rows);
          const done = { data: rows.map((r) => ({ ...r })), error: null };
          return Object.assign(Promise.resolve(done), { select: () => ({ single: () => Promise.resolve({ data: { ...rows[0] }, error: null }) }) });
        },
        update: (p: Row) => { mode = "update"; patch = p; return q; },
        delete: () => { mode = "delete"; return q; },
        eq: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
        in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; },
        is: (c: string, v: null) => { filters.push((r) => (r[c] ?? null) === v); return q; },
        // ISO timestamps and numbers both compare correctly as-is.
        gte: (c: string, v: string | number) => { filters.push((r) => r[c] !== null && r[c] !== undefined && (r[c] as string | number) >= v); return q; },
        lte: (c: string, v: string | number) => { filters.push((r) => r[c] !== null && r[c] !== undefined && (r[c] as string | number) <= v); return q; },
        range: (a: number, b: number) => { off = a; lim = b - a + 1; return q; },
        order: (c: string, o?: { ascending?: boolean }) => { order = [c, o?.ascending !== false]; return q; },
        limit: (n: number) => { lim = n; return q; },
        maybeSingle: () => { const r = result(); return Promise.resolve({ data: (r.data as Row[] | null)?.[0] ?? null, error: null }); },
        single: () => { const r = result(); return Promise.resolve({ data: (r.data as Row[] | null)?.[0] ?? null, error: null }); },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      return q;
    },
  };
}

/** The active rule version seeded by the fut schema migration (fc27-community-v1), as rows. */
export function seededRules(): Record<string, Row[]> {
  const v = "fc27-community-v1";
  const th = (link_type: string, pts: number[]) => pts.map((players_required, i) => ({ rule_version_id: v, link_type, points: i + 1, players_required }));
  return {
    chemistry_rule_versions: [{ id: v, season: "FC27", status: "unverified", is_active: true }],
    chemistry_thresholds: [...th("club", [2, 4, 7]), ...th("nation", [2, 5, 8]), ...th("league", [3, 5, 8])],
    chemistry_modifiers: [
      { rule_version_id: v, key: "player.max_chemistry", value: 3 },
      { rule_version_id: v, key: "manager.nation_count", value: 1 },
      { rule_version_id: v, key: "manager.league_count", value: 1 },
      { rule_version_id: v, key: "icon.always_max", value: 1 },
      { rule_version_id: v, key: "hero.always_max", value: 0 },
      { rule_version_id: v, key: "icon.nation_bonus", value: 1 },
      { rule_version_id: v, key: "icon.every_league_bonus", value: 1 },
      { rule_version_id: v, key: "hero.league_bonus", value: 1 },
      { rule_version_id: v, key: "hero.nation_bonus", value: 1 },
    ],
  };
}
