import type { Awareness } from "y-protocols/awareness";

export interface PresenceUser {
  name: string;
  email: string;
  color: string;
}

export interface Peer extends PresenceUser {
  clientId: number;
  isSelf: boolean;
  cursor?: { anchor: number; head: number } | null;
}

/** Deterministic, readable colour per user (same on every client). */
export function colorForUser(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 70% 45%)`;
}

export function displayName(email: string, name?: string | null): string {
  const n = (name ?? "").trim();
  if (n) return n.slice(0, 40);
  const local = email.split("@")[0] || "Anonymous";
  return local.slice(0, 40);
}

export function makeLocalUser(email: string, name?: string | null): PresenceUser {
  return { name: displayName(email, name), email, color: colorForUser(email.toLowerCase()) };
}

export function setLocalUser(awareness: Awareness, user: PresenceUser) {
  awareness.setLocalStateField("user", user);
}

export function setLocalCursor(awareness: Awareness, cursor: { anchor: number; head: number } | null) {
  awareness.setLocalStateField("cursor", cursor);
}

/**
 * Peers from awareness states. Remote state is untrusted: values are type-checked and clamped,
 * colour must match a strict HSL pattern so it can be safely used in CSS.
 */
export function listPeers(awareness: Awareness): Peer[] {
  const out: Peer[] = [];
  awareness.getStates().forEach((state, clientId) => {
    const u = (state as any)?.user;
    if (!u || typeof u.email !== "string") return;
    const color = typeof u.color === "string" && /^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/.test(u.color) ? u.color : colorForUser(u.email);
    const c = (state as any).cursor;
    const cursor =
      c && Number.isInteger(c.anchor) && Number.isInteger(c.head) && c.anchor >= 0 && c.head >= 0
        ? { anchor: c.anchor as number, head: c.head as number }
        : null;
    out.push({
      clientId,
      isSelf: clientId === awareness.clientID,
      name: displayName(u.email, typeof u.name === "string" ? u.name : null),
      email: u.email.slice(0, 254),
      color,
      cursor,
    });
  });
  return out.sort((a, b) => a.clientId - b.clientId);
}

/** Peers deduplicated by email (a user with two tabs shows once). */
export function uniquePeers(peers: Peer[]): Peer[] {
  const seen = new Set<string>();
  return peers.filter((p) => (seen.has(p.email) ? false : (seen.add(p.email), true)));
}
