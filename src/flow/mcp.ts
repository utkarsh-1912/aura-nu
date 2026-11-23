/**
 * MCP-style external tool registry: typed descriptors, a server/tool allow-list and an approval
 * policy. There is intentionally NO network implementation: the host injects an `McpTransport`.
 * Nothing here is reachable from flows until a host registers a server AND allow-lists its tools.
 */
import type { JsonSchema } from "./types";
import { validateJson } from "./jsonschema";
import type { RiskLevel } from "./tools";

export type McpApprovalPolicy = "never" | "writes" | "untrusted" | "always";

export interface McpToolDescriptor {
  name: string;
  description: string;
  schema: JsonSchema;
  risk: RiskLevel;
  writes: boolean;
  /** Result may contain third-party text: downstream decisions are tainted. */
  returnsUntrusted: boolean;
}

export interface McpServerConfig {
  id: string;
  label: string;
  tools: McpToolDescriptor[];
  /** Tools callable from flows. Empty = nothing callable (deny by default). */
  allowTools: string[];
  /** Default "writes": write tools and anything risky on tainted input need a human. */
  approval?: McpApprovalPolicy;
}

export interface McpCallContext {
  runId: string;
  idempotencyKey: string;
  dryRun: boolean;
}

export interface McpTransport {
  call(server: string, tool: string, args: Record<string, unknown>, ctx: McpCallContext): Promise<unknown>;
}

export interface McpDecision {
  allowed: boolean;
  needsApproval: boolean;
  reason: string;
}

export class McpError extends Error {
  constructor(readonly code: "NOT_REGISTERED" | "NOT_ALLOWED" | "INVALID_ARGS" | "NO_TRANSPORT", message: string) {
    super(message);
    this.name = "McpError";
  }
}

const RISK = { read: 0, low: 1, medium: 2, high: 3 } as const;
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export const qualifiedMcpName = (server: string, tool: string) => `mcp:${server}/${tool}`;

export function parseMcpName(q: string): { server: string; tool: string } | null {
  const m = /^mcp:([^/]+)\/(.+)$/.exec(q);
  return m ? { server: m[1], tool: m[2] } : null;
}

export class McpRegistry {
  private servers = new Map<string, McpServerConfig>();
  constructor(private transport?: McpTransport) {}

  register(cfg: McpServerConfig): void {
    if (!ID_RE.test(cfg.id)) throw new McpError("NOT_REGISTERED", `invalid server id '${cfg.id}'`);
    const names = new Set<string>();
    for (const t of cfg.tools) {
      if (!ID_RE.test(t.name) || names.has(t.name)) throw new McpError("NOT_REGISTERED", `invalid or duplicate tool '${t.name}'`);
      names.add(t.name);
    }
    for (const a of cfg.allowTools) if (!names.has(a)) throw new McpError("NOT_ALLOWED", `allow-list names unknown tool '${a}'`);
    this.servers.set(cfg.id, { ...cfg, approval: cfg.approval ?? "writes" });
  }

  unregister(id: string) { this.servers.delete(id); }

  /** Tools a flow may reference (allow-listed only). */
  list(): { name: string; descriptor: McpToolDescriptor; server: string }[] {
    const out: { name: string; descriptor: McpToolDescriptor; server: string }[] = [];
    for (const s of this.servers.values()) for (const t of s.tools) if (s.allowTools.includes(t.name)) out.push({ name: qualifiedMcpName(s.id, t.name), descriptor: t, server: s.id });
    return out;
  }

  private find(q: string) {
    const p = parseMcpName(q);
    const srv = p && this.servers.get(p.server);
    const tool = srv?.tools.find((t) => t.name === p!.tool);
    if (!p || !srv || !tool) throw new McpError("NOT_REGISTERED", `unknown MCP tool '${q}'`);
    return { srv, tool, p };
  }

  decide(q: string, ctx: { tainted: boolean }): McpDecision {
    let f;
    try { f = this.find(q); } catch (e) { return { allowed: false, needsApproval: false, reason: (e as Error).message }; }
    if (!f.srv.allowTools.includes(f.tool.name)) return { allowed: false, needsApproval: false, reason: `'${q}' is not in the allow-list` };
    const pol = f.srv.approval ?? "writes";
    const risky = RISK[f.tool.risk] >= RISK.medium;
    const needs = pol === "always" || (pol !== "never" && f.tool.writes) || (pol !== "never" && ctx.tainted && risky);
    return { allowed: true, needsApproval: needs, reason: needs ? `policy '${pol}' requires approval` : "allowed" };
  }

  async call(q: string, args: Record<string, unknown>, ctx: McpCallContext & { tainted?: boolean; approved?: boolean }): Promise<unknown> {
    const d = this.decide(q, { tainted: !!ctx.tainted });
    if (!d.allowed) throw new McpError("NOT_ALLOWED", d.reason);
    if (d.needsApproval && !ctx.approved) throw new McpError("NOT_ALLOWED", `'${q}' needs approval before it can run`);
    const { tool, p } = this.find(q);
    const bad = validateJson(tool.schema, args, "args");
    if (bad.length) throw new McpError("INVALID_ARGS", bad.join("; "));
    if (tool.writes && ctx.dryRun) return { dryRun: true, wouldCall: q, args };
    if (!this.transport) throw new McpError("NO_TRANSPORT", "no MCP transport is configured");
    return this.transport.call(p.server, p.tool, args, { runId: ctx.runId, idempotencyKey: ctx.idempotencyKey, dryRun: ctx.dryRun });
  }
}
