import { describe, it, expect } from "vitest";
import { lockText, unlockText, changePassword, isLockedEnvelope, VaultError, DEFAULT_ITERATIONS } from "../../src/core/vaultCrypto";

const FAST = { iterations: 2000 };
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof VaultError ? e.code : "other"; } };

describe("vaultCrypto", () => {
  it("round-trips unicode text and uses fresh salt/iv", async () => {
    const a = await lockText("héllo 🔒 secret", "correct horse", FAST);
    const b = await lockText("héllo 🔒 secret", "correct horse", FAST);
    expect(a).not.toBe(b);
    expect(a).not.toContain("secret");
    expect(isLockedEnvelope(a)).toBe(true);
    expect(await unlockText(a, "correct horse")).toBe("héllo 🔒 secret");
  });
  it("detects wrong password", async () => {
    const a = await lockText("x", "pw", FAST);
    expect(await code(unlockText(a, "nope"))).toBe("WRONG_PASSWORD");
    expect(await code(unlockText(a, ""))).toBe("WRONG_PASSWORD");
  });
  it("detects ciphertext tampering", async () => {
    const o = JSON.parse(await lockText("some content here", "pw", FAST));
    const raw = Uint8Array.from(atob(o.ct), (c) => c.charCodeAt(0));
    raw[0] ^= 1;
    o.ct = btoa(String.fromCharCode(...raw));
    expect(await code(unlockText(JSON.stringify(o), "pw"))).toBe("TAMPERED");
  });
  it("detects header tampering (iteration downgrade)", async () => {
    const o = JSON.parse(await lockText("x", "pw", { iterations: 5000 }));
    o.iter = 1000;
    expect(["TAMPERED", "WRONG_PASSWORD"]).toContain(await code(unlockText(JSON.stringify(o), "pw")));
    const o2 = JSON.parse(await lockText("x", "pw", FAST));
    o2.iv = btoa(String.fromCharCode(...new Uint8Array(12).fill(7)));
    expect(await code(unlockText(JSON.stringify(o2), "pw"))).toBe("TAMPERED");
  });
  it("rejects malformed / unsupported envelopes", async () => {
    expect(await code(unlockText("nope", "pw"))).toBe("BAD_ENVELOPE");
    expect(await code(unlockText(JSON.stringify({ v: 2 }), "pw"))).toBe("UNSUPPORTED_VERSION");
    expect(await code(unlockText(JSON.stringify({ v: 1, kdf: "PBKDF2-SHA256", iter: 1e12, salt: "", iv: "", check: "", ct: "" }), "pw"))).toBe("BAD_ENVELOPE");
    expect(isLockedEnvelope("# plain note")).toBe(false);
  });
  it("refuses weak iteration counts", async () => {
    await expect(lockText("x", "pw", { iterations: 10 })).rejects.toThrow(RangeError);
  });
  it("changePassword", async () => {
    const a = await lockText("data", "old", FAST);
    const b = await changePassword(a, "old", "new", FAST);
    expect(await code(unlockText(b, "old"))).toBe("WRONG_PASSWORD");
    expect(await unlockText(b, "new")).toBe("data");
  });
  it("default iteration count works and is high", async () => {
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    const a = await lockText("x", "pw");
    expect(JSON.parse(a).iter).toBe(DEFAULT_ITERATIONS);
    expect(await unlockText(a, "pw")).toBe("x");
  }, 20000);
});
