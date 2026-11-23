import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { SignJWT, generateKeyPair, createLocalJWKSet, exportJWK } from "jose";
import { requireAuth, getUserEmail, type AuthConfig } from "../server/auth";

const PROJECT = "aura-test";
let privateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

async function token(claims: Record<string, unknown>, opts: { aud?: string; iss?: string; exp?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience(opts.aud ?? PROJECT)
    .setSubject("uid-1")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(privateKey);
}

function appWith(cfg: AuthConfig) {
  const app = express();
  app.use("/api", requireAuth(() => cfg));
  app.get("/api/me", (req, res) => res.json({ email: getUserEmail(req) }));
  return app;
}

beforeAll(async () => {
  const kp = await generateKeyPair("RS256");
  privateKey = kp.privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

describe("requireAuth (firebase configured)", () => {
  const cfg = () => ({ projectId: PROJECT, production: true, jwks });

  it("accepts a valid token and uses the verified email", async () => {
    const t = await token({ email: "Alice@Example.com" });
    const res = await request(appWith(cfg())).get("/api/me").set("Authorization", `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("alice@example.com");
  });

  it("ignores a spoofed x-user-email header without a token", async () => {
    const res = await request(appWith(cfg())).get("/api/me").set("x-user-email", "victim@example.com");
    expect(res.status).toBe(401);
  });

  it("prefers the token over a spoofed header", async () => {
    const t = await token({ email: "alice@example.com" });
    const res = await request(appWith(cfg()))
      .get("/api/me").set("Authorization", `Bearer ${t}`).set("x-user-email", "victim@example.com");
    expect(res.body.email).toBe("alice@example.com");
  });

  it("rejects wrong audience, wrong issuer, expired and garbage tokens", async () => {
    for (const t of [
      await token({ email: "a@b.co" }, { aud: "other" }),
      await token({ email: "a@b.co" }, { iss: "https://evil.example" }),
      await token({ email: "a@b.co" }, { exp: "-1h" }),
      "not.a.jwt",
    ]) {
      const res = await request(appWith(cfg())).get("/api/me").set("Authorization", `Bearer ${t}`);
      expect(res.status).toBe(401);
    }
  });

  it("rejects a token with no email", async () => {
    const t = await token({});
    const res = await request(appWith(cfg())).get("/api/me").set("Authorization", `Bearer ${t}`);
    expect(res.status).toBe(401);
  });
});

describe("requireAuth (modes without Firebase)", () => {
  it("production without a project id rejects everything", async () => {
    const res = await request(appWith({ production: true })).get("/api/me").set("x-user-email", "a@b.co");
    expect(res.status).toBe(401);
  });

  it("dev mode accepts the header and defaults to the sandbox user", async () => {
    const app = appWith({ production: false });
    expect((await request(app).get("/api/me").set("x-user-email", "dev@x.io")).body.email).toBe("dev@x.io");
    expect((await request(app).get("/api/me")).body.email).toBe("sandbox@aura.io");
    expect((await request(app).get("/api/me").set("x-user-email", "../../etc")).body.email).toBe("sandbox@aura.io");
  });
});
