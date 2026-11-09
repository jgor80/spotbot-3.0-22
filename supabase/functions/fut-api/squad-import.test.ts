// Squad import: typed lists read without AI, chat messages and screenshots read by Claude (faked here), matching to
// the user's own cards and the FUT.GG market card list, and placement into the squad's slots.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";
import { nameScore, normalize, parseSquadList } from "../_shared/fut/squad-import.ts";

const ME = "11111111-1111-4111-8111-111111111111";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

// Fictional market cards in the shape the FUT.GG catalogue job stores them.
let ea = 1000;
const market = (player_name: string, overall: number, position: string, extra: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(), owner_user_id: null, source_id: "futgg_catalogue", source_card_key: String(ea++), season: "FC27",
  player_name, version: "Rare", overall, positions: [position], club: `${player_name} FC`, league: "Test League", nation: "Testland",
  is_icon: false, is_hero: false, evidence: "game_data", price: 1000, ...extra,
});

function setup(opts: { env?: Record<string, string>; ai?: unknown; aiStatus?: number } = {}) {
  const env = { FUT_ENABLED: "true", ...(opts.env ?? {}) };
  const db = futMemoryDb({
    ...seededRules(),
    player_cards: [
      market("Kylian Mbappé", 91, "ST"), market("Kylian Mbappé", 95, "ST", { version: "TOTW" }),
      market("Martin Ødegaard", 89, "CAM"), market("Bukayo Saka", 88, "RW"), market("Gianluigi Donnarumma", 89, "GK"),
      market("Virgil van Dijk", 90, "CB"), market("William Saliba", 87, "CB"), market("Alisson", 89, "GK"),
    ],
  });
  const sent: Record<string, unknown>[] = [];
  const deps: Deps = {
    db,
    userFor: (req) => Promise.resolve(req.headers.get("x-test-user")),
    env: (k) => env[k as keyof typeof env],
    fetch: ((_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      const status = opts.aiStatus ?? 200;
      const body = status === 200 ? { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(opts.ai) }] } : { error: { message: "nope" } };
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }) as unknown as Deps["fetch"],
  };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  return { db, call, sent };
}

// deno-lint-ignore no-explicit-any
const slotOf = (squad: any, slot: string) => squad.slots.find((s: any) => s.slot === slot)?.card;

Deno.test("plain lists are read without AI, in several shapes", () => {
  const a = parseSquadList("ST Mbappe 91\nCAM: Odegaard\nSaka - RW\nGK Donnarumma (89)");
  assert(a?.via === "list" && a.entries.length === 4, `four lines ${JSON.stringify(a)}`);
  assert(a.entries[0]!.position === "ST" && a.entries[0]!.rating === 91 && a.entries[0]!.name === "Mbappe", "position, name, rating");
  assert(a.entries[2]!.position === "RW" && a.entries[2]!.name === "Saka", "name then position");
  const one = parseSquadList("ST Mbappe, CAM Odegaard, RW Saka");
  assert(one?.entries.length === 3, "comma-separated on one line");
  const csv = parseSquadList("position,name,rating,version\nST,Mbappe,95,TOTW\nLCB,Van Dijk,90,");
  assert(csv?.entries[0]!.version === "TOTW" && csv.entries[1]!.slot === "LCB" && csv.entries[1]!.position === "CB", "CSV with slot names");
  const f = parseSquadList("4-3-3\nST Mbappe");
  assert(f?.formation === "4-3-3", "formation line");
  assert(parseSquadList("put Saka at RW") === null, "a sentence goes to Claude");
  assert(parseSquadList("my keeper is Alisson and up top I have Mbappe") === null, "free text goes to Claude");
});

Deno.test("names match without accents and with partial names", () => {
  assert(normalize("Martin Ødegaard") === "martin odegaard", "ø");
  assert(nameScore("Mbappe", "Kylian Mbappé") === 90, "surname only");
  assert(nameScore("Kylian Mbappe", "Kylian Mbappé") === 100, "accent off");
  assert(nameScore("van dijk", "Virgil van Dijk") === 90, "two-word surname");
  assert(nameScore("Mbape", "Kylian Mbappé") > 0, "typo still close");
  assert(nameScore("Saka", "Saliba") === 0, "different player");
});

Deno.test("a typed list fills the squad: owned cards first, rating picks the version, slots by position", async () => {
  const { call, sent } = setup();
  // The user owns a 91 Mbappé (their club sync), so a plain "Mbappe" means that one.
  const own = (await call("POST", "/v1/cards", { player_name: "Kylian Mbappé", overall: 91, positions: ["ST", "LW"], club: "Kylian Mbappé FC", league: "Test League", nation: "Testland", evidence: "game_data" })).data.data.id;
  const squad = (await call("POST", "/v1/squads/new", { formation: "4-3-3" })).data.data;
  const r = await call("POST", "/v1/squads/import", { squad, text: "ST Mbappe\nRW Saka 88\nGK Donnarumma\nCB van dijk\nCB Saliba\nCAM Odegaard" });
  assert(r.status === 200, `import ${JSON.stringify(r.data)}`);
  const d = r.data.data;
  assert(sent.length === 0, "no AI call for a plain list");
  assert(d.via === "list", "via list");
  assert(slotOf(d.squad, "ST")?.id === own && slotOf(d.squad, "ST").owned, "owned Mbappé in ST");
  assert(slotOf(d.squad, "RW")?.name === "Bukayo Saka", "Saka RW");
  assert(slotOf(d.squad, "GK")?.name === "Gianluigi Donnarumma", "GK");
  assert(slotOf(d.squad, "LCB")?.name === "Virgil van Dijk" && slotOf(d.squad, "RCB")?.name === "William Saliba", "both CBs");
  // No CAM in 4-3-3: Ødegaard goes to an empty slot (out of position) only if one is free — a short list leaves him in a CM slot.
  const ode = d.rows.find((x: { input: { name: string } }) => x.input.name === "Odegaard");
  assert(ode.card.name === "Martin Ødegaard" && ode.slot, `Ødegaard placed ${JSON.stringify(ode)}`);
  const mb = d.rows.find((x: { input: { name: string } }) => x.input.name === "Mbappe");
  assert(mb.options.length >= 2 && mb.options.some((o: { version: string }) => o.version === "TOTW"), "other versions offered");

  const totw = await call("POST", "/v1/squads/import", { squad, text: "ST Mbappe 95" });
  assert(slotOf(totw.data.data.squad, "ST")?.rating === 95, "rating picks the 95 TOTW");

  const missing = await call("POST", "/v1/squads/import", { squad, text: "ST Nobody Atall" });
  assert(missing.status === 200 && missing.data.data.rows[0].confidence === "missing" && !slotOf(missing.data.data.squad, "ST"), "unknown player reported, slot untouched");

  // The edited squad saves like any other.
  assert((await call("POST", "/v1/squads", d.squad)).status === 200, "save imported squad");
});

Deno.test("chat messages and screenshots go to Claude; its players are matched and placed", async () => {
  const ai = { formation: "4-4-2", players: [{ slot: null, position: "GK", name: "Alisson", rating: null, version: null }, { slot: "RST", position: "ST", name: "Kylian Mbappé", rating: 95, version: "TOTW" }], clear_slots: [], note: null };
  const { call, sent } = setup({ env: { ANTHROPIC_API_KEY: "test-key" }, ai });
  const squad = (await call("POST", "/v1/squads/new", { formation: "4-3-3" })).data.data;
  const r = await call("POST", "/v1/squads/import", { squad, text: "go 442, Alisson in goal and TOTW Mbappe up top on the right" });
  assert(r.status === 200, `chat ${JSON.stringify(r.data)}`);
  assert(sent.length === 1 && sent[0]!.output_config && (sent[0]!.system as string).includes("4-3-3"), "one Claude call with the squad as context");
  const d = r.data.data;
  assert(d.via === "ai" && d.formation_changed === "4-4-2" && d.squad.formation === "4-4-2", "formation switched");
  assert(slotOf(d.squad, "GK")?.name === "Alisson" && slotOf(d.squad, "RST")?.rating === 95, "placed by Claude's slot");

  const shot = await call("POST", "/v1/squads/import", { squad, image: { media_type: "image/png", data: "iVBORw0KGgo=" } });
  assert(shot.status === 200, `screenshot ${JSON.stringify(shot.data)}`);
  const img = (sent[1]!.messages as { content: { type: string }[] }[])[0]!.content[0]!;
  assert(img.type === "image", "screenshot sent as an image block");
  assert((await call("POST", "/v1/squads/import", { squad, image: { media_type: "application/pdf", data: "AAAA" } })).status === 400, "only images");
});

Deno.test("without an API key, lists still work and free text explains what's missing", async () => {
  const { call } = setup();
  const squad = (await call("POST", "/v1/squads/new", { formation: "4-3-3" })).data.data;
  assert((await call("POST", "/v1/squads/import", { squad, text: "ST Mbappe" })).status === 200, "list ok");
  const r = await call("POST", "/v1/squads/import", { squad, text: "my striker is Mbappe" });
  assert(r.status === 503 && /ANTHROPIC_API_KEY/.test(r.data.error), `needs key ${JSON.stringify(r.data)}`);
  assert((await call("POST", "/v1/squads/import", { squad, text: "" })).status === 400, "empty");
  const busy = setup({ env: { ANTHROPIC_API_KEY: "k" }, aiStatus: 529 });
  const sq2 = (await busy.call("POST", "/v1/squads/new", { formation: "4-3-3" })).data.data;
  assert((await busy.call("POST", "/v1/squads/import", { squad: sq2, text: "my striker is Mbappe" })).status === 502, "AI outage is a clear error");
});

Deno.test("every FC 27 formation is available, drawn from its own rows, and a squad can switch between them", async () => {
  const { call } = setup();
  const slots = (await call("GET", "/v1/formations/slots")).data.data;
  assert(Object.keys(slots).length === 28 && slots["4-3-3 (2)"].length === 11, "28 formations with 11 slots");
  assert(!JSON.stringify(slots).match(/"(LWB|RWB|CF|LF|RF)"/), "only FC 27's 12 positions");
  const squad = (await call("POST", "/v1/squads/new", { formation: "4-2-3-1 (2)" })).data.data;
  const filled = (await call("POST", "/v1/squads/import", { squad, text: "ST Mbappe\nRM Saka\nGK Alisson" })).data.data.squad;
  const moved = await call("POST", "/v1/squads/formation", { squad: filled, formation: "5-2-3" });
  assert(moved.status === 200 && moved.data.data.formation === "5-2-3", `switch ${JSON.stringify(moved.data)}`);
  assert(slotOf(moved.data.data, "ST")?.name === "Kylian Mbappé" && slotOf(moved.data.data, "GK")?.name === "Alisson", "cards kept");
  assert(moved.data.data.slots.filter((s: { card: unknown }) => s.card).length === 3, "nobody lost");
  assert((await call("POST", "/v1/squads/formation", { squad: filled, formation: "4-4-1-1" })).status === 400, "unknown formation");
  const listed = parseSquadList("4-3-3 (4)\nCAM Odegaard");
  assert(listed?.formation === "4-3-3 (4)", "variant formation in a list");
  assert(parseSquadList("4-3-3(2)\nST Mbappe")?.formation === "4-3-3 (2)", "variant without a space");
});
