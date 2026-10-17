// In-memory stand-in for the supabase-js query builder, used by the MCP and OAuth tests only.
type Row = Record<string, unknown>;

export function memoryDb(tables: Record<string, Row[]> = {}) {
  const t = (name: string) => (tables[name] ||= []);
  let seq = 1;
  return {
    tables,
    from(table: string) {
      let filters: ((r: Row) => boolean)[] = [];
      let mode: "select" | "update" | "insert" = "select";
      let patch: Row = {};
      let head = false;
      let order: [string, boolean] | null = null;
      let lim = Infinity;
      const match = () => t(table).filter((r) => filters.every((f) => f(r)));
      const result = () => {
        if (mode === "update") {
          const rows = match();
          for (const r of rows) Object.assign(r, patch);
          return { data: rows.map((r) => ({ ...r })), error: null };
        }
        let rows = match();
        if (order) {
          const [c, asc] = order;
          rows = [...rows].sort((a, b) => ((a[c] as string) > (b[c] as string) ? 1 : -1) * (asc ? 1 : -1));
        }
        rows = rows.slice(0, lim);
        return head ? { data: null, count: rows.length, error: null } : { data: rows.map((r) => ({ ...r })), count: rows.length, error: null };
      };
      const q = {
        select: (_cols?: string, opts?: { head?: boolean }) => { if (opts?.head) head = true; return q; },
        insert: (row: Row | Row[]) => {
          const rows = (Array.isArray(row) ? row : [row]).map((r) => ({ id: r.id ?? `id-${seq++}`, created_at: new Date(Date.now() + seq).toISOString(), revoked_at: null, ...r }));
          for (const r of rows) {
            for (const [k, v] of Object.entries(r)) {
              if (/_hash$/.test(k) && v && t(table).some((x) => x[k] === v)) return Object.assign(Promise.resolve({ data: null, error: { message: "duplicate" } }), { select: () => ({ single: () => Promise.resolve({ data: null, error: { message: "duplicate" } }) }) });
            }
            t(table).push(r);
          }
          const done = { data: rows, error: null };
          return Object.assign(Promise.resolve(done), { select: () => ({ single: () => Promise.resolve({ data: rows[0], error: null }) }) });
        },
        update: (p: Row) => { mode = "update"; patch = p; return q; },
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
        in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; },
        is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
        not: (c: string, _op: string, _v: unknown) => { filters.push((r) => (r[c] ?? null) !== null); return q; },
        gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return q; },
        ilike: (c: string, v: string) => { const n = v.replace(/%/g, "").toLowerCase(); filters.push((r) => String(r[c]).toLowerCase().includes(n)); return q; },
        or: () => q,
        lt: () => q,
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
