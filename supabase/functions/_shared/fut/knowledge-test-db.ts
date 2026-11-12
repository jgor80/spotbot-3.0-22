// Knowledge bank tests: the migration on real PostgreSQL (PGlite), and an rpc adapter so the services run against it.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";

export const KB_SETUP = `CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE TABLE auth.users(id UUID PRIMARY KEY); CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
-- Stand-ins for the card list and FUT.GG price tables that kb_player_cards reads
CREATE TABLE fut.player_cards(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id UUID, source_id TEXT, player_name TEXT, version TEXT,
  overall INTEGER, positions TEXT[], source_card_key TEXT);
CREATE TABLE fut.card_attributes(card_id UUID, alt_positions TEXT[]);
CREATE TABLE fut.futgg_snapshots(game_year INTEGER, platform TEXT, published_at TIMESTAMPTZ);
CREATE TABLE fut.futgg_prices(ea_item_id BIGINT, game_year INTEGER, platform TEXT, published_at TIMESTAMPTZ, price INTEGER);
GRANT ALL ON ALL TABLES IN SCHEMA fut TO service_role;`;
export const ME = "00000000-0000-0000-0000-000000000001";
export const OTHER = "00000000-0000-0000-0000-000000000002";

export async function knowledgeDb() {
  const db = new PGlite();
  await db.exec(KB_SETUP);
  for (const m of ["20261110160000_fut_knowledge_bank.sql", "20261112010000_fut_kb_retry.sql", "20261112090000_fut_kb_team.sql", "20261110230000_fut_sell_or_keep.sql"]) {
    await db.exec(await Deno.readTextFile(new URL(`../../../migrations/${m}`, import.meta.url)));
  }
  await db.exec("SET ROLE service_role");
  return db;
}

/** supabase-js style `rpc` over PGlite, calling fut functions with named arguments. */
export function rpcOver(db: PGlite) {
  return {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      const keys = Object.keys(args);
      const params = keys.map((k) => { const v = args[k]; return Array.isArray(v) && name === "card_price_trend" ? `{${v.join(",")}}` : v !== null && typeof v === "object" ? JSON.stringify(v) : v; });
      try {
        const r = await db.query<{ r: unknown }>(`SELECT fut.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) AS r`, params);
        return { data: r.rows[0]?.r ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  };
}
