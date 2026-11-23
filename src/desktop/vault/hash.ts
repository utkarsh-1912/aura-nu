/** Pluggable content hasher. Production: WebCrypto SHA-256 (works in Tauri webview, browsers, Node 20+). */
export type Hasher = (text: string) => Promise<string>;

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export const sha256Hasher: Hasher = async (text) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto SHA-256 unavailable; inject a Hasher");
  return hex(await subtle.digest("SHA-256", new TextEncoder().encode(text)));
};

/** Bytes variant for model files etc. */
export async function sha256Bytes(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto SHA-256 unavailable");
  return hex(await subtle.digest("SHA-256", data as unknown as ArrayBuffer));
}
