// Minimal MCP (Model Context Protocol) server over Streamable HTTP, stateless: every POST carries one
// JSON-RPC message (or a batch) and gets a plain JSON reply. No SDK, so it bundles for the self-hosted bot.

export const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const SERVER_INFO = { name: "gafferbot", title: "GafferBot", version: "1.0.0" };

export const INSTRUCTIONS =
  "GafferBot runs EA FC Pro Clubs communities on Discord. You act as the player who created the token and only " +
  "see servers they belong to. Start with list_servers to get a guild_id; when they are in just one server, guild_id " +
  "can be left out. Stats come from EA's Pro Clubs API; hidden stats are estimates. All tools are read-only.";

export interface Tool<Ctx> {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown>;
}

// Thrown by a tool for a problem the AI should see and can fix (bad argument, no access).
export class ToolError extends Error {}

type RpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function handleMessage<Ctx>(msg: RpcMessage, tools: Tool<Ctx>[], ctx: Ctx): Promise<unknown | null> {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg?.id, -32600, "Invalid Request");
  }
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const params = msg.params || {};

  switch (msg.method) {
    case "initialize": {
      const asked = String(params.protocolVersion || "");
      return ok({
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: true, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${String(params.name)}`);
      const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
      try {
        const data = await tool.run(args, ctx);
        return ok({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
      } catch (err) {
        if (!(err instanceof ToolError)) console.error(`[gafferbot-mcp] ${tool.name} failed:`, err);
        const text = err instanceof ToolError ? err.message : "Something went wrong reading GafferBot data. Try again.";
        return ok({ content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// One POST body: a single message or a batch. Returns the reply body, or null when nothing needs one (202).
export async function handleBody<Ctx>(body: unknown, tools: Tool<Ctx>[], ctx: Ctx): Promise<unknown | null> {
  if (Array.isArray(body)) {
    if (!body.length) return rpcError(null, -32600, "Invalid Request");
    const out = (await Promise.all(body.map((m) => handleMessage(m, tools, ctx)))).filter((r) => r !== null);
    return out.length ? out : null;
  }
  return handleMessage(body as RpcMessage, tools, ctx);
}
