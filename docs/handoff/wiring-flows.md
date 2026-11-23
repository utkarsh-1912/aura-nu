# Wiring: workflows + agents on real notes and the real AI API

## What is wired (all under `src/features/flows/`, tests in `tests/flows/`)
- `aiClient.ts` `createRealAiClient({ fetchFn: apiFetch })`: flow `AiClient` over `POST /api/ai/complete` and `/api/ai/chat`. JSON-schema outputs, per-call timeout + `AbortSignal`, typed `FlowAiError` (`AI_UNAVAILABLE`, `POLICY_BLOCKED`, `TIMEOUT`, `BAD_OUTPUT`, `ABORTED`). Tainted (note-derived) prompts and agent observations are fenced with `wrapUntrusted`. The whole rendered prompt of a tainted node is fenced (the executor cannot separate author text from note text), with a system rule to follow only the task.
- `workspaceApi.ts` `createWorkspaceApi(binding)`: real notes through host callbacks `getNotes/updateNotes` (+ reminders, `ensureFolder`). Writes dedupe on the idempotency key via a persisted ledger (`aura-flow-idem-<email>`) and key-derived ids (second guard if the ledger is lost). `scanDlp` uses `src/core/dlp.ts`; `src/flow/tools.ts` `dlpScan` (was heuristic stub) now uses the same engine.
- `flowLibrary.ts` `FlowLibrary`: per-user flows in `aura-flows-<email>`: autosaved draft, `commitVersion` (keeps last 20), `restore` (as a new version), duplicate/rename/delete, enable switch, kill switch (`aura-flows-killswitch-<email>`), `resolveFlow` for subflows.
- `services.ts` `createFlowRuntime`: executor per flow + persistent `LocalStorageRunStore` (`aura-flow-runs-<email>`, 50 runs) + crash `recover()`.
- `triggers.ts` `TriggerEngine` (pure): `note.created/updated/tagged`, `folder.changed`, `schedule` (`config.every` = `30s|15m|2h|1d`, or 5-field `config.cron` with `*`, n, a,b, `*/n`), manual; debounce, per-flow serialization, rate limit, self-write + chain-depth loop protection, kill switch. `useFlowTriggers.ts` is the React hook.
- Workflow Studio: multi-flow switcher, versions dialog with restore, duplicate/rename/delete, enable + "pause all automation" switches, run history (persistent), real-note picker (`aura-notes-backup-<email>`), live runs on real notes need confirmation, dry run is default. Badge shows MOCK AI (guest) or LIVE AI (`auth.currentUser`). Sample note runs in an in-memory sandbox.
- Agent Studio: "Convert to workflow" (uses `agentToFlow`, creates the flow in the library, navigates to `/org/:orgId/workflows?flow=<id>`).
- Executor (`src/flow/`): AI call timeouts (`aiTimeoutMs`, default 60s), `supervisor` node (fan-out/fan-in, concurrency limit, optional synthesis), `critic` node (ports true/false), `policy.requireCriticBeforeWrites` (validator error `critic_required`), `note.updated` trigger kind, MCP-style `McpRegistry` (`src/flow/mcp.ts`: typed descriptors, allow-list, approval policy, injected transport; no network code and not yet callable from flow nodes). Templates: "Research synthesis with critic", "Supervised triage".

## Lead: exact changes
1. `src/pages/WorkspacePage.tsx`, one line near `useNoteSync(...)`:
```tsx
import { useFlowTriggers } from "../features/flows/useFlowTriggers";
useFlowTriggers({ userEmail, notes, updateNotes: handleUpdateNotesAndSync, enabled: notesHydratedFor === userEmail });
```
   (`handleUpdateNotesAndSync` is defined after the hooks today; place the call after it.) Without this, enabled flows do not fire automatically; Studio still runs manually.
2. `src/App.tsx`: route `/org/:orgId/workflows` already exists. Nothing else required. Optional nav link to it from OrgHubPage/Sidebar.
3. Cleaner Studio wiring (replaces the localStorage path): pass `notes` and `updateNotes` props to `WorkflowStudioPage` and swap `localBinding(...)` for `{ getNotes, updateNotes }` in its `runtimes` memo. Today Studio writes `aura-notes-backup-<email>` directly; WorkspacePage reads it on mount and sync pushes the bumped `updatedAt`. While WorkspacePage is mounted in another tab, a `storage` event is NOT re-read by it; add a listener there if that matters.

## Server / other notes
- `/api/ai/*` must be mounted (docs/handoff/ai.md). If not, signed-in runs fail honestly with `AI_UNAVAILABLE`; nothing is faked.
- Triggers run only while the app is open; missed schedules are not caught up.
- Flows and runs are per device (localStorage). Run history stores the flow graph per run (max 50 runs).
- Approvals for trigger-started runs appear in Studio history (open the run, Approve/Reject).
- Sandbox mode of Studio cannot see real notes; real-note runs cannot run subflows across other users' flows.
- Unrelated: `tests/server/persist.test.ts` "atomic read-modify-write under contention" timed out once when the machine was busy (not flow code).
