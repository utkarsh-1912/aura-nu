import { describe, it, expect } from "vitest";
import {
  resolveRole, can, canGrant, createShareToken, verifyShareToken, resolveRoleWithLink,
  fromWorkspaceRole, type ChainNode, type Grant,
} from "../../src/core/acl";
import { nodeShareCrypto as crypto } from "../../api/collab/crypto";

const chain: ChainNode[] = [
  { type: "workspace", id: "w1", ownerEmail: "boss@x.io" },
  { type: "folder", id: "f1" },
  { type: "note", id: "n1", ownerEmail: "author@x.io" },
];
let seq = 0;
const g = (o: Omit<Grant, "id">): Grant => ({ id: `g${seq++}`, ...o });
const u = (email: string) => ({ type: "user" as const, email });
const SECRET = "0123456789abcdef-secret";

describe("resolveRole", () => {
  it("no grants -> no access; owners are Owner", () => {
    expect(resolveRole(chain, [], { email: "a@x.io" })).toBeNull();
    expect(resolveRole(chain, [], { email: "AUTHOR@x.io" })).toBe("Owner");
    expect(resolveRole(chain, [], { email: "boss@x.io" })).toBe("Owner");
  });
  it("inherits folder -> note, highest allow wins", () => {
    const grants = [
      g({ resourceType: "folder", resourceId: "f1", principal: u("a@x.io"), role: "Viewer" }),
      g({ resourceType: "note", resourceId: "n1", principal: u("a@x.io"), role: "Editor" }),
    ];
    expect(resolveRole(chain, grants, { email: "a@x.io" })).toBe("Editor");
    expect(resolveRole(chain, grants.slice(0, 1), { email: "a@x.io" })).toBe("Viewer");
  });
  it("group grants apply only to members", () => {
    const grants = [g({ resourceType: "folder", resourceId: "f1", principal: { type: "group", id: "eng" }, role: "Editor" })];
    expect(resolveRole(chain, grants, { email: "a@x.io", groupIds: ["eng"] })).toBe("Editor");
    expect(resolveRole(chain, grants, { email: "a@x.io", groupIds: ["ops"] })).toBeNull();
  });
  it("deny overrides allow at any depth and caps", () => {
    const allow = g({ resourceType: "note", resourceId: "n1", principal: u("a@x.io"), role: "Editor" });
    const denyAll = g({ resourceType: "workspace", resourceId: "w1", principal: u("a@x.io"), role: "Viewer", effect: "deny" });
    const denyEdit = g({ resourceType: "folder", resourceId: "f1", principal: u("a@x.io"), role: "Editor", effect: "deny" });
    expect(resolveRole(chain, [allow, denyAll], { email: "a@x.io" })).toBeNull();
    expect(resolveRole(chain, [allow, denyEdit], { email: "a@x.io" })).toBe("Commenter");
  });
  it("owner cannot be denied (no lock-out)", () => {
    const d = g({ resourceType: "note", resourceId: "n1", principal: u("author@x.io"), role: "Viewer", effect: "deny" });
    expect(resolveRole(chain, [d], { email: "author@x.io" })).toBe("Owner");
    expect(canGrant("Owner", d, chain)).toBe(false);
  });
  it("restricted node blocks inherited allows from above only", () => {
    const rc = chain.map((n) => (n.id === "n1" ? { ...n, restricted: true } : n));
    const up = g({ resourceType: "folder", resourceId: "f1", principal: u("a@x.io"), role: "Editor" });
    const own = g({ resourceType: "note", resourceId: "n1", principal: u("b@x.io"), role: "Viewer" });
    expect(resolveRole(rc, [up, own], { email: "a@x.io" })).toBeNull();
    expect(resolveRole(rc, [up, own], { email: "b@x.io" })).toBe("Viewer");
  });
  it("expired grants ignored; garbage fails closed", () => {
    const e = g({ resourceType: "note", resourceId: "n1", principal: u("a@x.io"), role: "Editor", expiresAt: 100 });
    expect(resolveRole(chain, [e], { email: "a@x.io" }, 101)).toBeNull();
    expect(resolveRole(chain, [e], { email: "a@x.io" }, 99)).toBe("Editor");
    const bad = { ...e, role: "Root" as any, expiresAt: undefined };
    expect(resolveRole(chain, [bad], { email: "a@x.io" })).toBeNull();
    expect(resolveRole([], [], { email: "a@x.io" })).toBeNull();
  });
  it("capabilities", () => {
    const grants = [g({ resourceType: "note", resourceId: "n1", principal: u("a@x.io"), role: "Commenter" })];
    expect(can(chain, grants, { email: "a@x.io" }, "comment")).toBe(true);
    expect(can(chain, grants, { email: "a@x.io" }, "write")).toBe(false);
  });
  it("maps workspace roles", () => {
    expect(fromWorkspaceRole("Guest")).toBe("Viewer");
    expect(fromWorkspaceRole("Admin")).toBe("Owner");
    expect(fromWorkspaceRole("hacker")).toBeNull();
  });
});

describe("canGrant (escalation)", () => {
  const base = { resourceType: "note" as const, resourceId: "n1", principal: u("z@x.io") };
  it("cannot grant above own role or without share", () => {
    expect(canGrant("Editor", g({ ...base, role: "Viewer" }), chain)).toBe(false);
    expect(canGrant("Viewer", g({ ...base, role: "Viewer" }), chain)).toBe(false);
    expect(canGrant(null, g({ ...base, role: "Viewer" }), chain)).toBe(false);
    expect(canGrant("Owner", g({ ...base, role: "Editor" }), chain)).toBe(true);
  });
  it("links can never be Owner", () => {
    expect(canGrant("Owner", g({ ...base, principal: { type: "link", linkId: "l" }, role: "Owner" }), chain)).toBe(false);
  });
});

describe("share links", () => {
  const now = 1_000_000;
  const mk = (over = {}) =>
    createShareToken({ lid: "L1", resourceType: "folder", resourceId: "f1", role: "Editor", ttlMs: 60_000, ...over }, SECRET, crypto, now);
  it("round-trips and scopes to the chain", () => {
    const v = verifyShareToken(mk(), SECRET, crypto, { now: now + 1 });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(resolveRoleWithLink(chain, [], { email: "anon@x.io" }, v.claims, now + 1)).toBe("Editor");
    const other: ChainNode[] = [{ type: "workspace", id: "w9" }, { type: "note", id: "nX" }];
    expect(resolveRoleWithLink(other, [], { email: "anon@x.io" }, v.claims, now + 1)).toBeNull();
  });
  it("rejects expiry, tamper, wrong secret, revoked, owner links", () => {
    const t = mk();
    expect(verifyShareToken(t, SECRET, crypto, { now: now + 60_001 })).toMatchObject({ ok: false, reason: "expired" });
    expect(verifyShareToken(t, "another-secret-value-xx", crypto, { now })).toMatchObject({ ok: false, reason: "signature" });
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), role: "Owner" })).toString("base64url");
    expect(verifyShareToken(`${forged}.${sig}`, SECRET, crypto, { now })).toMatchObject({ ok: false, reason: "signature" });
    expect(verifyShareToken(t, SECRET, crypto, { now, revoked: new Set(["L1"]) })).toMatchObject({ ok: false, reason: "revoked" });
    expect(verifyShareToken("junk", SECRET, crypto)).toMatchObject({ ok: false, reason: "malformed" });
    expect(() => mk({ role: "Owner" })).toThrow();
    expect(() => mk({ ttlMs: 1e12 })).toThrow();
  });
  it("a deny on the link caps it", () => {
    const v = verifyShareToken(mk(), SECRET, crypto, { now });
    if (!v.ok) throw new Error("bad");
    const d = g({ resourceType: "note", resourceId: "n1", principal: { type: "link", linkId: "L1" }, role: "Viewer", effect: "deny" });
    expect(resolveRoleWithLink(chain, [d], { email: "anon@x.io" }, v.claims, now)).toBeNull();
  });
});
