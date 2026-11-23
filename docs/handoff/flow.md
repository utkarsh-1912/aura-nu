# Handoff: workflow designer + agents v2 (area = flow)

## What exists
- `src/flow/` framework-free engine: `types`, `schema` (validator, `agentToFlow` migration, `autoLayout`), `expr` (safe engine, no eval), `jsonschema`, `tools` (typed registry, risk/scope, `basicDlpScan`), `executor` (durable journal/replay executor), `templates` (5 starters), `stores` (Memory + LocalStorage RunStore), `mock` (MOCK AiClient + in-memory WorkspaceApi).
- UI: `src/pages/WorkflowStudioPage.tsx` (props `userEmail`, `activeTheme`) and `src/components/flow/*`.
- Tests: `tests/flow/*` (`npx vitest run tests/flow`).

## Wiring needed from the lead (not done, shared files)
1. Route in `src/App.tsx` (match how AgentStudioPage is mounted):
   ```tsx
   import WorkflowStudioPage from "./pages/WorkflowStudioPage";
   <Route path="/org/:orgId/workflows" element={<WorkflowStudioPage userEmail={userEmail} activeTheme={activeTheme} />} />
   ```
2. A nav entry (OrgHubPage / Sidebar) linking to that route.
3. `@xyflow/react` CSS is imported inside the page (`@xyflow/react/dist/style.css`); no other config needed.

## Production integration points
- `WorkspaceApi` (src/flow/types.ts): implement over the real notes store/API. Writes receive an `idempotencyKey`; the implementation MUST dedupe on it (a crashed in-flight step is re-run with the same key).
- `AiClient`: adapt the real `src/ai` client to `complete()` and `agentStep()`. Studio currently uses `MockAiClient`, labelled MOCK in the UI.
- `RunStore`: replace `LocalStorageRunStore` with a server-backed store for org flows; the interface is 5 async methods.
- `resolveFlow` dep is needed for subflow nodes (the studio does not provide one yet).
- Triggers (note.created, schedule, webhook ...) are modelled but nothing fires them yet; call `executor.start(flow, { input: { note } })` from the event source.

## Semantics worth knowing
- Loop: port `true` = body (loop the last body node back into the loop node), `ok` = after loop. Body nodes must not be shared with the rest of the graph (validator enforces).
- Untrusted content: a node is tainted if its templates reference `note`/`trigger` (non-manual trigger), tainted nodes, or loop items from tainted data; agents become tainted after calling a tool that returns note text. Medium/high-risk tools (update_note, move_note) on tainted input pause for human approval unless `policy.requireApprovalForUntrusted` is false (validator warns).
- Dry-run writes nothing: write tools return planned diffs; approvals auto-pass.
- Agent modes: `act`, `approve_writes`, `propose_only` (maps legacy autonomy levels).

## Not done
- No expression-driven scheduling/trigger runtime, no flow versioning/rollback UI, no MCP tool plug-in, no critic/supervisor multi-agent patterns, no eval harness, no AbortSignal/timeouts on individual AI calls, no real DLP policy engine (heuristic stub), the studio does not yet read the user's real notes.
- The legacy `AgentStudioPage` is untouched; `agentToFlow()` is available but no UI action calls it yet.
