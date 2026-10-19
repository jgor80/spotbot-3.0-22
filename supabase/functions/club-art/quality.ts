// Post-render quality check: a vision model looks at every club-art render before anyone sees it.
// A render that fails (stray text, a melted face, the wrong number of players, a cropped head,
// the wrong kit, someone else's face) is silently redrawn with the issues named in the prompt,
// up to AI_IMAGE_QA_RETRIES extra times (default 2, at most 3). Those retries are on us, never the
// server's image allowance. AI_IMAGE_QA=off skips the check. If the checker itself is unreachable
// the render is kept, so an outage never blocks graphics.

export type QaInput = {
  kind: string;
  players: number; // footballers who should be in the picture (0 = silhouette or trophy-only)
  kitColours: string[];
  kitNumbers: number[]; // the only numerals allowed (verified shirt numbers)
  headshot: boolean;
  likeness: number; // reference photos of the players attached after the render, in player order
};

export type QaVerdict = { checked: boolean; pass: boolean; score: number; issues: string[] };

export const QA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text_free", "number_ok", "player_count", "faces_ok", "anatomy_ok", "framing_ok", "kit_ok", "likeness_ok", "score", "issues"],
  properties: {
    text_free: { type: "boolean", description: "True when there are no letters, words, logos, watermarks or garbled glyphs anywhere (the allowed kit number aside)." },
    number_ok: { type: "boolean", description: "True when no numbers appear except the allowed kit number, printed correctly." },
    player_count: { type: "integer", description: "How many footballers are clearly shown." },
    faces_ok: { type: "boolean", description: "True when every visible face is intact: symmetric eyes, one nose and mouth, no melting, smearing or doubled features." },
    anatomy_ok: { type: "boolean", description: "True when bodies are correct: two arms and two legs each, five fingers per visible hand, no fused or floating limbs, no merged players." },
    framing_ok: { type: "boolean", description: "True when no player's head, face or chin is cut off by the image edge." },
    kit_ok: { type: "boolean", description: "True when the players' kit is mainly in the requested colours." },
    likeness_ok: { type: "boolean", description: "True when the player in the render is clearly the same character as the reference (hair colour and style, facial hair, skin tone, glasses, face shape). True when there is no reference." },
    score: { type: "integer", description: "Overall quality from 0 (unusable) to 10 (flawless, ready to post)." },
    issues: { type: "array", items: { type: "string" }, description: "Each problem found, as a short instruction to fix it." },
  },
} as const;

export function qaEnabled(env: (k: string) => string | undefined) {
  return !/^(off|false|0|no)$/i.test(String(env("AI_IMAGE_QA") ?? "").trim());
}

// Extra renders allowed after a failed check (0-3, default 2)
export function qaRetries(raw: string | undefined) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? Math.min(3, Math.max(0, n)) : 2;
}

export function qaPrompt(q: QaInput) {
  const who = q.players === 0
    ? "No player's face should be the focus: any footballer is a silhouette or seen from behind (a distant crowd is fine)."
    : `Exactly ${q.players} footballer${q.players === 1 ? "" : "s"} should be shown${q.players > 1 ? ", each a distinct person" : ""}.`;
  return [
    "You are the quality inspector for paid football club artwork. Be strict: the customer pays for this image, so flag anything a fan would notice.",
    "The FIRST image is the render to inspect.",
    q.likeness === 1 ? "The SECOND image is a reference photo of the player; check the render shows the same character."
      : q.likeness > 1 ? `Images 2 to ${q.likeness + 1} are reference photos of the players; check each one appears in the render as the same character, with no traits swapped between them.`
      : "There is no reference photo; set likeness_ok true.",
    who,
    q.kitNumbers.length ? `The only allowed text is the shirt number${q.kitNumbers.length > 1 ? "s" : ""} ${q.kitNumbers.join(", ")}; any other letters, numbers or logos fail.` : "There must be no text, letters, numbers, logos or watermarks at all, including on shirts.",
    q.kitColours.length ? `The kit should be ${q.kitColours.join(" and ")}.` : "Any kit colours are fine; set kit_ok true unless the kit is visibly broken.",
    q.headshot ? "This is a head-and-shoulders portrait; shoulders running off the bottom edge are expected." : "Full or partial bodies are fine, but heads must be fully inside the frame.",
    "Ignore artistic style, lighting and background choices. Judge only correctness.",
  ].join(" ");
}

export function judge(raw: unknown, q: QaInput): QaVerdict {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const issues = Array.isArray(r.issues) ? r.issues.filter((i): i is string => typeof i === "string" && i.trim().length > 0).map((i) => i.trim().slice(0, 160)).slice(0, 6) : [];
  const failed: string[] = [];
  if (r.text_free !== true) failed.push("stray text or logos");
  if (r.number_ok !== true) failed.push(q.kitNumbers.length ? `shirt numbers must be ${q.kitNumbers.join(", ")} only` : "no numbers allowed");
  // Silhouettes and trophy art have no countable faces, so only player renders are counted
  if (q.players > 0 && Number(r.player_count) !== q.players) failed.push(`must show exactly ${q.players} player${q.players === 1 ? "" : "s"}`);
  if (r.faces_ok !== true) failed.push("distorted face");
  if (r.anatomy_ok !== true) failed.push("broken hands or limbs");
  if (r.framing_ok !== true) failed.push("head cut off at the edge");
  if (r.kit_ok !== true) failed.push("wrong kit colours");
  if (q.likeness > 0 && r.likeness_ok !== true) failed.push("does not look like the reference player");
  const score = Number.isFinite(Number(r.score)) ? Math.min(10, Math.max(0, Math.round(Number(r.score)))) : 0;
  const pass = failed.length === 0 && score >= 6;
  return { checked: true, pass, score, issues: pass ? [] : [...new Set([...failed, ...issues])].slice(0, 8) };
}

// Prompt line for the next attempt after a failed check
export function retryHint(issues: string[]) {
  return issues.length ? ` QUALITY FIX (a previous attempt was rejected): ${issues.join("; ")}. Fix every one of these this time.` : "";
}

// Keep the first passing render, else the best-scoring one
export function pickBest<T extends { qa: QaVerdict }>(attempts: T[]): T | null {
  if (!attempts.length) return null;
  return attempts.find((a) => a.qa.pass) ?? [...attempts].sort((a, b) => b.qa.score - a.qa.score)[0];
}

// The text a Responses API answer carries (non-streamed)
export function responseText(out: unknown): string {
  const o = out as { output_text?: unknown; output?: { content?: { type?: string; text?: string }[] }[] } | null;
  if (typeof o?.output_text === "string") return o.output_text;
  return (o?.output ?? []).flatMap((m) => m.content ?? []).filter((c) => c.type === "output_text" && typeof c.text === "string").map((c) => c.text).join("");
}

const UNCHECKED: QaVerdict = { checked: false, pass: true, score: 0, issues: [] };

export async function checkRender(
  fetchFn: typeof fetch, gateway: string, key: string,
  q: QaInput, renderB64: string, references: File[], timeoutMs = 45_000,
): Promise<QaVerdict> {
  const content: unknown[] = [
    { type: "input_text", text: qaPrompt(q) },
    { type: "input_image", image_url: `data:image/png;base64,${renderB64}` },
  ];
  for (const ref of references.slice(0, q.likeness)) {
    const bytes = new Uint8Array(await ref.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    content.push({ type: "input_image", image_url: `data:${ref.type || "image/png"};base64,${btoa(bin)}` });
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${gateway}/v1/responses`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        store: false,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "render_qa", strict: true, schema: QA_SCHEMA } },
        input: [{ role: "user", content }],
      }),
    });
    if (!res.ok) { console.warn(`[club-art] quality check unavailable: ${res.status}`); return UNCHECKED; }
    return judge(JSON.parse(responseText(await res.json())), q);
  } catch (err) {
    console.warn(`[club-art] quality check failed: ${err instanceof Error ? err.message : err}`);
    return UNCHECKED;
  } finally {
    clearTimeout(timer);
  }
}
