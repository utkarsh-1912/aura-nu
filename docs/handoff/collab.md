# Handoff: Collaboration (Yjs) and Enterprise (Phase 6)

Everything here is additive. Nothing in shared files was edited. Tests: `npx vitest run tests/collab tests/enterprise` (60 passing).

## What exists

| Path | Purpose |
|---|---|
| `src/core/acl.ts` | Pure ACL: roles, inheritance, deny-overrides, signed expiring share links, grant-escalation guard |
| `src/core/dlp.ts` | Pure DLP: secret/PII detectors, custom regex (validated), policy engine, redaction |
| `api/collab/server.ts` | `attachCollabServer(httpServer, deps)`: authenticated Yjs sync + awareness WebSocket server |
| `api/collab/docStore.ts` | `DocStore`: `MemoryDocStore`, `FileDocStore`, `MongoDocStore` (UNTESTED vs live Mongo) |
| `api/collab/access.ts` | `createAclAccessChecker(AclSource)` bridges ACL resolver to the server |
| `api/collab/crypto.ts` | `nodeShareCrypto` (HMAC-SHA256 + constant-time compare) for share tokens |
| `src/collab/provider.ts` | `createNoteCollab(...)`: Y.Doc + y-indexeddb + websocket with token refresh and backoff |
| `src/collab/markdown.ts` | `seedFromMarkdown` (idempotent across clients), `exportMarkdown`, `applyTextDiff` |
| `src/collab/presence.ts` | Awareness helpers (name/colour/cursor), sanitised peer listing |
| `api/enterprise/scim.ts`, `scimStore.ts` | `createScimRouter(deps)`, in-memory directory + hashed token store |
| `api/enterprise/metering.ts` | `meteringMiddleware`, `MemoryMeteringStore`, `MongoMeteringStore` (UNTESTED vs live Mongo) |

## Wiring required from the lead

### 1. Attach the collab server (api/index.ts, only when running as a long-lived Node process)
```ts
import http from "node:http";
import { attachCollabServer } from "./collab/server";
import { FileDocStore } from "./collab/docStore";          // or MongoDocStore
import { createAclAccessChecker } from "./collab/access";

const server = http.createServer(app);                      // replace app.listen(...)
const collab = attachCollabServer(server, {
  store: new FileDocStore(process.env.COLLAB_DATA_DIR ?? "./.collab-data"),
  access: createAclAccessChecker({ loadChain, loadGrants, loadGroups }), // implement against Mongo notes/folders/shares
  allowedOrigins: (process.env.COLLAB_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
});
server.listen(PORT);
process.on("SIGTERM", async () => { await collab.close(); server.close(); });
```
`loadChain(noteId)` must return `[workspace, ...folders, note]` as `ChainNode[]` (with `ownerEmail` on the note/workspace) or `null` if absent. Grants and groups come from your own collections (groups can be fed by SCIM).
The default authenticator reuses `resolveIdentity` (Firebase ID token). No change to `api/auth.ts` is needed.

### 2. Mount SCIM
```ts
import { createScimRouter } from "./enterprise/scim";
app.use("/scim/v2", createScimRouter({ tokens, directory, onDeprovision }));
```
Implement `ScimDirectory` and `ScimTokenStore` on Mongo (in-memory versions are for tests/dev). `onDeprovision(orgId, user)` MUST revoke the user's org membership/sessions; the collab server picks revocation up within `recheckMs` (30 s) via the access checker. Issue per-org tokens by storing `hashToken(plaintext)` only (see `MemoryScimTokens.issue`). Do not put SCIM behind `requireAuth`; it has its own bearer scheme. Tier gate it with `canConfigureSSO` (enterprise) when creating tokens.

### 3. Metering
```ts
import { meteringMiddleware, MongoMeteringStore } from "./enterprise/metering";
app.use("/api/ai", requireAuth(), meteringMiddleware({ store, tenantOf: r => orgIdOrEmail(r), tierOf: loadTier }));
```
`tenantOf` must come from authenticated state only. Create a unique index `{tenant:1, period:1}` for the Mongo store (and `{room:1, seq:1}` unique for `MongoDocStore`).

### 4. Client
```ts
const c = createNoteCollab({ noteId, serverUrl: import.meta.env.VITE_COLLAB_URL, getToken: () => auth.currentUser?.getIdToken() ?? Promise.resolve(null), user: { email } });
await c.whenLocalLoaded; await c.whenSynced.catch(() => {}); seedFromMarkdown(c.doc, note.content);
```
Bind the existing editor with `applyTextDiff(c.text, value)` on local change and `c.text.observe` on remote change. Call `seedFromMarkdown` only after the first sync. The current body is a `Y.Text` named `body`; if the editor moves to TipTap, `@tiptap/extension-collaboration` uses a `Y.XmlFragment`, so a one-time migration of the markdown into that fragment is needed (not done).

### Env vars
`VITE_COLLAB_URL` (client, `wss://.../collab`), `COLLAB_DATA_DIR`, `COLLAB_ALLOWED_ORIGINS`, `SHARE_LINK_SECRET` (>=16 chars, required by `createShareToken`), `FIREBASE_PROJECT_ID` (existing).

## Deployment shape

Vercel serverless functions cannot hold WebSockets, so the collab server cannot run there. Recommended: keep the REST API on Vercel and run `attachCollabServer` in one small always-on Node service (Fly.io, Railway, a VM or Cloud Run with min-instances=1 and session affinity) on e.g. `collab.example.com`. Rooms live in process memory, so a room must map to exactly one instance: run a single instance, or route by room id (consistent hashing at the proxy). Horizontal scale needs a pub/sub layer between instances; that is NOT implemented.

nginx:
```
location /collab/ {
  proxy_pass http://127.0.0.1:4000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 3600s;
  # do not log Sec-WebSocket-Protocol: it carries the bearer token
}
```
Terminate TLS (wss) at the proxy. Configure access logs to omit the `Sec-WebSocket-Protocol` header.

## Wire protocol
`wss://host/collab/<room>` with `Sec-WebSocket-Protocol: aura-collab.v1, bearer.<Firebase ID token>`. Rooms: `note:<[A-Za-z0-9_-]{1,128}>`. y-websocket compatible framing (sync = 0, awareness = 1). Failure statuses on upgrade: 400 bad room/protocol, 401 unauthenticated, 403 no access or unknown room (identical, so rooms cannot be probed), 429 connection caps, 503 shutting down. Close codes: 1008 rate limit, 1009 too big, 1007 malformed, 1003 unsupported, 4403 access revoked.

## Threat model

| Threat | Mitigation | Residual / note |
|---|---|---|
| Unauthenticated socket | Token verified on upgrade (Firebase JWKS via `resolveIdentity`) before the handshake completes | Dev-header fallback follows `api/auth.ts` rules (off in production) |
| Token leakage in logs | Token travels in `Sec-WebSocket-Protocol`, never the URL; query-string tokens are ignored (tested) | Proxy must not log that header; ID tokens live ~1 h |
| Cross-site WebSocket hijack | Optional exact-match `Origin` allow-list; no cookies are used for auth | Set `allowedOrigins` in production |
| Reading/writing another user's note | Per-room check via `AccessChecker` on upgrade; 403 for both no-access and nonexistent | Correctness depends on your `AclSource` data |
| Viewer writes | Sync step2/update frames from non-writers are dropped server-side (tested) | Awareness from viewers is still allowed (presence) |
| Revoked/downgraded user keeps a live socket | Re-check every `recheckMs`; revoked -> close 4403, downgrade applies at once; errors fail closed | Up to `recheckMs` window |
| Awareness spoofing | Client IDs tracked per connection and removed on close; client-side peer data sanitised (colour regex, type checks) | A user can still show a fake display name within their own session |
| DoS: huge/fast messages | `maxPayload`, per-connection msgs/s and bytes/s, per-room and per-user connection caps, doc size cap | Limits are per process, no global limit |
| Malformed frames | try/catch, close 1007; unknown types close 1003 | |
| Data loss on crash | Append-only log, torn-tail tolerant load, atomic compaction via rename, flush on shutdown | `FileDocStore` is single-node; Mongo adapter untested |
| Room id path traversal | Strict room regex; file names are SHA-256 of room | |
| Share-link forgery / escalation | HMAC-SHA256 verified (constant time) before parsing, bounded TTL (<= 90 d), Owner links forbidden, link must name a resource on the requested chain, revocation set | Revocation list storage is yours; secret rotation invalidates all links |
| Grant escalation | `canGrant`: needs share, cannot exceed own role, links <= Editor, no deny on owner | Enforce on every grant-write route |
| SCIM token theft/brute force | Per-org tokens, SHA-256 at rest, constant-time compare, identical 401 for unknown org/wrong token | Add rate limiting at the edge; rotate tokens |
| SCIM cross-org access | Every directory call is scoped by the org of the token; group members validated against the same org (tested) | |
| Stale access after deprovision | `active=false` or DELETE triggers `onDeprovision` (once) | Wire it to revoke sessions/memberships |
| DLP ReDoS / secret leak | Bounded patterns, input cap 1 M chars, custom regex vetted (nested quantifiers/backreferences rejected), findings contain only a masked preview, log summary has counts only | Custom-pattern vetting is conservative, not a proof; detectors are heuristics |
| Quota bypass / races | Atomic check-and-increment before the handler, tenant from authenticated state, overrides can only tighten, store failure -> 503 | Mongo path untested live |

## NOT done / untested
- Live MongoDB for `MongoDocStore` and `MongoMeteringStore` (shape-level test only).
- Multi-instance collab (pub/sub), TipTap `XmlFragment` binding, UI for sharing/presence, share-link REST routes and grant persistence, DLP wiring into AI/outbound calls, SCIM Mongo directory, `ServiceProviderConfig` is minimal (no `/Schemas`, `/ResourceTypes`).
- Browser y-indexeddb path is untested (tests run in Node with persistence off).
