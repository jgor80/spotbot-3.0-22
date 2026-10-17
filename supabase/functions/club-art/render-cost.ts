// What one image render cost, from the token usage OpenAI returns with every GPT image call.
// USD per 1M tokens. gpt-image-1 and gpt-image-1.5 are from OpenAI's model pages (checked
// 2026-10-17); gpt-image-1-mini is unverified. Unknown models log tokens with no cost.
export const IMAGE_PRICES: Record<string, { text: number; image: number; output: number }> = {
  "gpt-image-1": { text: 5, image: 10, output: 40 },
  "gpt-image-1.5": { text: 5, image: 8, output: 32 },
  "gpt-image-1-mini": { text: 2, image: 2.5, output: 8 },
};

export type ImageUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
};

const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);

export function renderCost(model: string, usage: ImageUsage | null | undefined) {
  if (!usage) return null;
  const input = int(usage.input_tokens);
  const image = int(usage.input_tokens_details?.image_tokens);
  // Without a breakdown, count every input token as text (the cheaper rate) rather than guess
  const text = usage.input_tokens_details?.text_tokens !== undefined ? int(usage.input_tokens_details.text_tokens) : Math.max(0, input - image);
  const output = int(usage.output_tokens);
  const price = IMAGE_PRICES[model.replace(/^openai\//, "")];
  const cost = price ? (text * price.text + image * price.image + output * price.output) / 1_000_000 : null;
  return { text_tokens: text, image_tokens: image, output_tokens: output, cost_usd: cost === null ? null : Math.round(cost * 100000) / 100000 };
}

// How many of a player's own photos a single-player render sends (AI_IMAGE_REFERENCES, 1-3, default 2).
// Each extra high-fidelity reference adds thousands of input tokens; the stable face anchor goes first.
export function referenceLimit(raw: string | undefined): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isInteger(n) ? Math.min(3, Math.max(1, n)) : 2;
}
