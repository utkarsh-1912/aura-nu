# Server wiring (collab, shares, SCIM, metering, AI policy)

Code: `server/platform.ts` (composition), `server/persist.ts` (Memory/File/Mongo collections), `server/grantStore.ts`, `server/sharesRoutes.ts`, `server/tenancy.ts`, `server/aiPolicy.ts`, `server/enterprise/scimPersist.ts`. `api/index.ts` only wires them. Tests: `tests/server/*` (94).

## Env vars
`SHARE_LINK_SECRET` (>=16 chars; unset => share-link routes 503, user-to-user shares still work), `COLLAB_ALLOWED_ORIGINS`, `COLLAB_DATA_DIR`, `AURA_DATA_DIR` (file backend root; platform data in `<dir>/platform/`), `SCIM_BASE_URL`, `AURA_AI_POLICY`, `MONGODB_URI`, `FIREBASE_PROJECT_ID`. Add `.collab-data` / `.aura-data` to .gitignore.

## Deployment shape
- Long-lived Node (`npm run dev` / `NODE_ENV=production tsx api/index.ts`): `http.Server` + `attachCollabServer` at `/collab/<room>`, SIGTERM/SIGINT call `collab.close()` (flushes Yjs logs). Doc store is chosen once after the Mongo connect attempt (Mongo `aura_collab_updates` or `FileDocStore`).
- Vercel (`VERCEL` set): no WebSockets, REST only. Collab needs an always-on host (see collab.md). File backends are ephemeral on Vercel, so use Mongo there.
- Backend switching is per call like the v2 note store: data written to files is not migrated when Mongo later connects.
- Mongo paths (usage `$inc`, collection CAS, doc log) are tested only against in-memory fakes, not a live MongoDB. Indexes created on connect: `aura_usage {tenant,period}` unique, `aura_collab_updates {room,seq}` unique.

## Model
- Notes are per-user, so a collab room is owner-qualified: `note:<sha256(owner,noteId)[0..40)>`. The owner is recorded when a note passes through `PUT /api/v2/notes/:id` (and backfilled from `GET /changes`); `DELETE` drops the room and its grants. Bare `note:<id>` rooms are always denied.
- Folders are keyed by (owner, folder name); a note's chain is `[folder, note]`. Moving a note changes who can see it.
- Grants live on the resource (`grants` collection). Link tokens are signed (HMAC) AND must still exist in the store; redeeming converts a link into a user grant (`via`=link id), because the WebSocket authenticates only with the Firebase token. Revoking a link revokes everything redeemed through it.
- Only the resource Owner manages sharing. Roles grantable: Viewer/Commenter/Editor. Max 200 grants per resource, links <= 90 days (default 7), user grants <= 5 years.

## What the client must call (all `Authorization: Bearer <Firebase ID token>`)
- `GET /api/v2/shares/room/:noteId` -> `{roomId}` for the caller's own synced note. Use it as the collab room (`wss://host/collab/<roomId>`). 404 until the note has been PUT.
- `GET /api/v2/shares/with-me` -> `{items:[{type,key,roomId,ownerEmail,role,expiresAt}]}` (direct and folder shares). Recipients open `roomId` directly.
- `GET|POST /api/v2/shares/:type/:id/grants`, `DELETE .../grants/:grantId` (`type` = `note|folder`; `:id` = own note id / folder name, or the server key). POST body `{principal:{type:"user",email}|{type:"link"}, role, expiresAt?(epoch ms)}`. Link responses include `token` once. A grantee may DELETE their own grant to leave.
- `POST /api/v2/shares/links/verify|redeem` `{token}`; redeem returns `{roomId, role}`.
- `GET /api/usage` -> tier, period, limits, usage, remaining, effective `aiPolicy`. Optional header `X-Aura-Org: <orgId>` picks among orgs the caller belongs to (ignored otherwise).
- AI endpoints (`/api/ai/*` POST, `/api/ai/action`, `/api/agents/execute`) now return `429 {error:"quota_exceeded",limit,used,resetsAt}` (+ `Retry-After`); 5xx results are refunded. Show an upgrade/limit message.
- Admin UI: `GET|PUT /api/org/:orgId/ai-policy` `{policy}`; `GET|POST /api/org/:orgId/scim-tokens`, `DELETE .../:tokenId` (enterprise tier + OrgOwner/OrgAdmin; token shown once). IdP points at `/scim/v2/<orgId>` with that bearer.
- Client collab: stop deriving `note:<id>`; use the server `roomId`. Guests (no Firebase token) get 401 everywhere.

## Semantics worth knowing
- AI policy = strictest of `AURA_AI_POLICY` and the policies of every org the caller is a member of. `workspaceId` from clients is ignored (it would let callers pick a looser policy). Store errors fail closed.
- Quota tenant = org id for team/enterprise orgs the caller belongs to (highest tier), else the user's email (personal). Tier comes from the Org record, never the client.
- SCIM deprovision (active=false or DELETE): removes the org membership (never an OrgOwner), invalidates the tenancy cache, and revokes grants the user holds on notes owned by that org's members. Shares from outsiders are left alone. Live sockets drop within `recheckMs` (30 s).
- SCIM groups feed ACL group principals as `<orgId>:<groupId>`; there is no REST route to grant to a group yet.

## Not done
Live Mongo verification; multi-instance collab; group-principal grant UI/route; workspace-level shares; `/api/agents/execute` consumes a quota action even when it returns the client-side fallback; file backend `all()` scans a directory (fine for dev/small, use Mongo at scale).
