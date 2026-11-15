import assertNode from "node:assert/strict";
import { memoryDb } from "../gafferbot-mcp/test-db.ts";
import { clubTransferNews, detectMoves, filterPlayers, type BoardPlayer } from "../../../src/lib/transfers.ts";
import { recordMemberSightings } from "../_shared/transfers.ts";
import { clearCache, createHandler } from "./handler.ts";

const eq = (a: unknown, b: unknown, msg?: string) => assertNode.deepEqual(a, b, msg);
const ok = (v: unknown, msg?: string) => assertNode.ok(v, msg);
const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

Deno.test("a move is a gamertag new to this club whose latest sighting was elsewhere", () => {
  const prior = [
    { ea_club_id: "1", ea_key: "nine", club_name: "Old FC", last_seen: ago(3) },
    { ea_club_id: "2", ea_key: "nine", club_name: "Older FC", last_seen: ago(20) },
    { ea_club_id: "5", ea_key: "stays", club_name: "Us", last_seen: ago(1) },
    { ea_club_id: "1", ea_key: "stale", club_name: "Old FC", last_seen: ago(90) },
  ];
  const moves = detectMoves("5", "Us", ["Nine", "Stays", "Stale", "Brand New", "nine"], prior);
  eq(moves, [{ ea_key: "nine", ea_username: "Nine", from_club_id: "1", from_club_name: "Old FC", to_club_id: "5", to_club_name: "Us" }]);
});

Deno.test("sightings are stored and moves logged once", async () => {
  const db = memoryDb();
  eq(await recordMemberSightings(db, { platform: "common-gen5", clubId: "1", clubName: "Old FC", names: ["Nine", "Eight"] }), 0);
  eq(db.tables.ea_club_members.length, 2);
  eq(await recordMemberSightings(db, { platform: "common-gen5", clubId: "5", clubName: "Us", names: ["Nine"] }), 1);
  eq(await recordMemberSightings(db, { platform: "common-gen5", clubId: "5", clubName: "Us", names: ["Nine"] }), 0, "already in this club now");
  eq(db.tables.transfer_moves.length, 1);
  eq(db.tables.transfer_moves[0].to_club_name, "Us");
  // Other platforms are separate
  eq(await recordMemberSightings(db, { platform: "nx", clubId: "9", clubName: "Switch FC", names: ["Eight"] }), 0);
});

Deno.test("club transfer news and board filters", () => {
  const moves = [
    { ea_username: "A", platform: "common-gen5", from_club_id: "1", from_club_name: "X", to_club_id: "5", to_club_name: "Us", detected_at: ago(1) },
    { ea_username: "B", platform: "common-gen5", from_club_id: "5", from_club_name: "Us", to_club_id: "7", to_club_name: "Y", detected_at: ago(2) },
  ];
  const news = clubTransferNews(moves, "5");
  eq(news.joined.map((m) => m.ea_username), ["A"]);
  eq(news.left.map((m) => m.ea_username), ["B"]);
  const p = (positions: string[], platform: string, verified: boolean) => ({ id: positions[0], status: "looking", positions, platform, timezone: null, gamertag: null, verified, notes: null, updatedAt: ago(1), stats: null }) as BoardPlayer;
  const list = [p(["CB"], "ps5", true), p(["ST", "CAM"], "xbox", false), p(["GK"], "ps5", false)];
  eq(filterPlayers(list, { line: "DEF" }).map((x) => x.id), ["CB"]);
  eq(filterPlayers(list, { line: "ATT" }).map((x) => x.id), ["ST"]);
  eq(filterPlayers(list, { platform: "ps5", verifiedOnly: true }).map((x) => x.id), ["CB"]);
});

Deno.test("the board only shows opted-in, live listings and never Discord IDs", async () => {
  const db = memoryDb({
    free_agents: [
      { id: "fa1", discord_user_id: "111", status: "looking", position: "CB", secondary_positions: ["RB"], platform: "ps5", timezone: "UK", ea_username: "Rock", ea_verified: true, notes: "Comp", public_board: true, no_contact: false, updated_at: ago(2) },
      { id: "fa2", discord_user_id: "222", status: "looking", position: "ST", secondary_positions: [], public_board: false, no_contact: false, updated_at: ago(2) },
      { id: "fa3", discord_user_id: "333", status: "off", position: "GK", secondary_positions: [], public_board: true, no_contact: false, updated_at: ago(2) },
      { id: "fa4", discord_user_id: "444", status: "open", position: "CM", secondary_positions: [], public_board: true, no_contact: true, updated_at: ago(2) },
      { id: "fa5", discord_user_id: "555", status: "open", position: "CM", secondary_positions: [], public_board: true, no_contact: false, updated_at: ago(45) },
    ],
    player_summary: [
      { discord_user_id: "111", games_played: 30, avg_match_rating: 7.5, goals: 2, assists: 4, man_of_match: 3 },
      { discord_user_id: "111", games_played: 10, avg_match_rating: 6.5, goals: 0, assists: 1, man_of_match: 0 },
    ],
    club_wanted: [
      { club_name: "Us FC", positions: "CB, GK", invite_url: "https://discord.gg/abc", ea_club_id: "5", ea_platform: "common-gen5", updated_at: ago(1), expires_at: ago(-5) },
      { club_name: "Expired FC", positions: "ST", invite_url: "javascript:alert(1)", updated_at: ago(20), expires_at: ago(6) },
    ],
    transfer_moves: [{ ea_username: "Nine", platform: "common-gen5", from_club_id: "1", from_club_name: "Old FC", to_club_id: "5", to_club_name: "Us", detected_at: ago(1) }],
  });
  clearCache();
  const handle = createHandler(() => db);
  const res = await handle(new Request("http://x/transfer-board"));
  eq(res.status, 200);
  const text = await res.text();
  ok(!/"111"|discord_user_id/.test(text), "no Discord IDs");
  const body = JSON.parse(text);
  eq(body.players.map((p: BoardPlayer) => p.id), ["fa1"]);
  eq(body.players[0].positions, ["CB", "RB"]);
  eq(body.players[0].stats, { games: 40, rating: 7.3, goals: 2, assists: 5, motm: 3 });
  eq(body.clubs.map((c: { name: string }) => c.name), ["Us FC"]);
  eq(body.clubs[0].invite, "https://discord.gg/abc");
  eq(body.moves.length, 1);
  eq((await handle(new Request("http://x/transfer-board", { method: "POST" }))).status, 405);
});
