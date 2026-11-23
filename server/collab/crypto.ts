import { createHmac, timingSafeEqual } from "node:crypto";
import type { ShareCrypto } from "../../src/core/acl";

export const nodeShareCrypto: ShareCrypto = {
  hmac: (secret, data) => createHmac("sha256", secret).update(data).digest("base64url"),
  equals: (a, b) => {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  },
};
