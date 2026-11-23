import type { AiPolicy } from "../src/ai/types";
import type { DocCollection } from "./persist";
import type { MeteringStore, UsageSnapshot } from "./enterprise/metering";

export const AI_POLICIES: readonly AiPolicy[] = ["cloud-allowed", "self-host-only", "local-only"];
export const isAiPolicy = (v: unknown): v is AiPolicy => typeof v === "string" && (AI_POLICIES as readonly string[]).includes(v);

const STRICTNESS: Record<AiPolicy, number> = { "cloud-allowed": 0, "self-host-only": 1, "local-only": 2 };
/** The more restrictive of the given policies (undefined entries are ignored). */
export function strictest(policies: Array<AiPolicy | undefined | null>): AiPolicy {
  let best: AiPolicy = "cloud-allowed";
  for (const p of policies) if (p && isAiPolicy(p) && STRICTNESS[p] > STRICTNESS[best]) best = p;
  return best;
}

export function parseDefaultPolicy(v: string | undefined): AiPolicy {
  return isAiPolicy(v) ? v : "cloud-allowed";
}

export interface PolicyDoc {
  orgId: string;
  policy: AiPolicy;
  updatedBy: string;
  updatedAt: string;
}

export class AiPolicyStore {
  constructor(private col: DocCollection<PolicyDoc>) {}
  get(orgId: string) {
    return this.col.get(`org:${orgId}`);
  }
  async set(orgId: string, policy: AiPolicy, by: string) {
    const doc: PolicyDoc = { orgId, policy, updatedBy: by, updatedAt: new Date().toISOString() };
    await this.col.set(`org:${orgId}`, doc);
    return doc;
  }
}

type UsageDoc = UsageSnapshot & { tenant: string; period: string };

/** MeteringStore on a DocCollection (file or in-memory backend). Per-key serialised, so tryConsume is atomic. */
export class CollectionMeteringStore implements MeteringStore {
  constructor(private col: DocCollection<UsageDoc>) {}
  private key = (t: string, p: string) => `${t}|${p}`;
  private blank = (t: string, p: string): UsageDoc => ({ tenant: t, period: p, actions: 0, tokensIn: 0, tokensOut: 0 });

  async tryConsume(tenant: string, period: string, amount: number, limit: number) {
    let out = { ok: false, used: 0 };
    await this.col.update(this.key(tenant, period), (cur) => {
      const c = cur ?? this.blank(tenant, period);
      if (limit >= 0 && c.actions + amount > limit) {
        out = { ok: false, used: c.actions };
        return cur;
      }
      out = { ok: true, used: c.actions + amount };
      return { ...c, actions: c.actions + amount };
    });
    return out;
  }
  async refund(tenant: string, period: string, amount: number) {
    await this.col.update(this.key(tenant, period), (cur) => (cur ? { ...cur, actions: Math.max(0, cur.actions - amount) } : null));
  }
  async addTokens(tenant: string, period: string, tokensIn: number, tokensOut: number) {
    await this.col.update(this.key(tenant, period), (cur) => {
      const c = cur ?? this.blank(tenant, period);
      return { ...c, tokensIn: c.tokensIn + tokensIn, tokensOut: c.tokensOut + tokensOut };
    });
  }
  async get(tenant: string, period: string) {
    const c = await this.col.get(this.key(tenant, period));
    return { actions: c?.actions ?? 0, tokensIn: c?.tokensIn ?? 0, tokensOut: c?.tokensOut ?? 0 };
  }
}
