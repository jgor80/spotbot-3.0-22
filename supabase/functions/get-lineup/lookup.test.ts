import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { lineupLookup } from "./lookup.ts";

Deno.test("an ID lookup needs server access", () => {
  assertEquals(lineupLookup({ lineup_id: "abc" }), { by: "id", value: "abc", needsAccess: true });
});

Deno.test("a share_code sent with an ID does not skip the access check", () => {
  assertEquals(lineupLookup({ lineup_id: "abc", share_code: "anything" }), { by: "id", value: "abc", needsAccess: true });
});

Deno.test("a share code alone is a public lookup by that code", () => {
  assertEquals(lineupLookup({ share_code: "XYZ123" }), { by: "share_code", value: "XYZ123", needsAccess: false });
});

Deno.test("empty or non-string values are rejected", () => {
  assertEquals(lineupLookup({}), null);
  assertEquals(lineupLookup({ lineup_id: "  ", share_code: "" }), null);
  assertEquals(lineupLookup({ lineup_id: 42, share_code: ["x"] }), null);
});
