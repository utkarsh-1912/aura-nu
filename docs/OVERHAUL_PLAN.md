# Aura Next — Overhaul & Upgrade Plan

Status: proposal · Date: 2026-11-22 · Scope: web app, desktop app, AI/agent platform, workflow designer, open-weight model strategy

---

## 1. Where we are (audit of this repo)

**What exists:** React 19 + Vite + Tailwind 4 SPA, Express API (`api/index.ts`, 936 lines), Mongo with JSON-file fallback, Firebase Auth, Gemini-only AI, a first Agent Studio (`AgentStudioPage.tsx`, `lib/agentTools.ts`) with 6 tools and a deterministic client-side planner, tier permissions, org hub, audit logs.

**Findings that shape the plan (verified in code):**

| # | Finding | Why it matters |
|---|---|---|
| 1 | API identity is the `x-user-email` header, defaulting to `sandbox@aura.io` (`api/index.ts:482`). No Firebase ID-token verification found. | Anyone can read/write any user's notes. **Blocker for anything enterprise.** |
| 2 | `/api/notes` POST syncs the **whole notes array** (last-write-wins). | Two devices silently overwrite each other. Cannot support desktop + web, or collaboration. |
| 3 | Note body is a single Markdown string in `content`; tables/code are embedded components inside a 3,128-line `EditorArea.tsx`. | No block model, no backlinks graph, no structured attachments, hard to test. |
| 4 | Per-user data files (`notes-db_*.json`) are tracked in git. | Possible personal-data leak in history; should be purged and ignored. |
| 5 | AI = one provider (Gemini), with canned "fallback" text that pretends to summarize (`getFallbackAiResponse`). | Misleading offline behavior; no model choice, no local/private mode. |
| 6 | Agents: tools are a fixed enum; plan is "thoughts + toolCalls" in one shot; `totalRuns`/`lastRunAt` seeded with fake numbers. | Not yet a real agent loop; no state, memory, evals, or workflow graph. |
| 7 | God files: `EditorArea` 3.1k, `WorkspacePage` 2.4k, `AiPanel` 1.5k, `Dashboard` 1.5k, `Sidebar` 1.5k lines. | Slows every feature below; needs decomposition first. |
| 8 | No tests, no CI, `lint` = `tsc --noEmit` only. | Refactor risk is unmanaged. |

**Decision:** treat Phase 0 (security + data model) as non-negotiable before features.

---

## 2. Product vision: a true Apple Notes competitor

Apple Notes wins on: instant launch, zero-config sync, Quick Note anywhere, scanning/handwriting, locked notes, shared folders, smart folders, Spotlight search, and Apple Intelligence. We beat it on what it lacks: **cross-platform, open formats, real collaboration, backlinks, structured data, automation, and private/local AI of your choosing.**

### Parity (must-have)
Rich text + checklists + tables + attachments, folders/subfolders, tags, smart folders, pin, lock (per-note E2E), Quick Note global hotkey, doc scanning + OCR, drawing/handwriting canvas, audio recording with transcription, link previews, shared folders with live cursors, Spotlight-grade search, import from Apple Notes/Evernote/Notion/Markdown, export to Markdown/PDF.

### Differentiators
1. **Open data**: notes stay plain Markdown + frontmatter on disk (desktop vault) — no lock-in.
2. **Backlinks + graph + transclusion** (`[[link]]`, `![[embed]]`).
3. **Database views** (table/board/calendar) over note properties.
4. **Local-first + E2E sync** — works fully offline; server sees ciphertext in "Private" vaults.
5. **Bring-your-own-model AI**: local open-weight, self-hosted endpoint, or cloud — per workspace policy.
6. **Visual workflow designer** (Section 5) — automations Apple Notes cannot do.

---

## 3. Target architecture

```
                 ┌──────────────── shared packages (monorepo) ────────────────┐
                 │ @aura/core    note model, block schema, CRDT docs, search   │
                 │ @aura/sync    op-log sync client, E2E crypto                │
                 │ @aura/ai      provider router, tool registry, agent runtime │
                 │ @aura/flow    workflow graph schema + executor              │
                 │ @aura/ui      design system components                      │
                 └───────────────┬──────────────────────┬──────────────────────┘
                                 │                      │
                  apps/web (PWA, Vite)        apps/desktop (Tauri v2)
                                 │                      │
                                 └────── apps/server (API + sync) ──────┐
                                          Postgres + object store + queue
```

**Key choices**

- **Monorepo** (pnpm workspaces + Turborepo). Extract the logic out of the god components into `@aura/*` packages first; UI becomes thin.
- **Editor**: migrate to **TipTap/ProseMirror** (block schema, Markdown round-trip, collab-ready) instead of the hand-rolled 3k-line editor.
- **Sync/collab**: **Yjs** (text-optimized CRDT, offline-capable) for note bodies; plain LWW rows for metadata (folders, settings). Per-note doc updates, not whole-array posts. Source: [Yjs for local-first collab, noqta.tn](https://noqta.tn/tutorials/local-first-yjs-react-collaborative-app-2026) and the caution that CRDTs help in specific places, not everywhere ([DEV](https://dev.to/raxxostudios/local-first-architecture-for-solo-apps-when-crdts-help-and-when-they-hurt-4pj0)).
- **Storage**: client = SQLite (OPFS on web, native SQLite on desktop) + FTS5 for search; server = Postgres + pgvector, S3-compatible blobs. Retire the JSON-file DB as a production path (keep only as dev fixture).
- **Auth**: verify Firebase ID tokens (or migrate to OIDC) on every request; derive user from token, never from headers; per-workspace RBAC enforced server-side; rate limits, Helmet, strict CORS, audit log writes server-side.
- **E2E vaults**: per-vault key wrapped by user passphrase/passkey; AI on E2E notes runs **only local**.
- **Observability**: keep Sentry; add structured logs, per-tenant AI cost/usage metering.

---

## 4. Dedicated desktop version

**Recommendation: Tauri v2** (Rust shell + the same React UI).
Reported footprints are roughly 3–10 MB installers and ~40–80 MB idle RAM versus ~120–200 MB / ~150–400 MB for Electron ([tech-insider comparison](https://tech-insider.org/tauri-vs-electron-desktop-app-framework-2026/) — headline ratios vary by benchmark, so measure our own build). Notes apps such as Beaver Notes are moving to Tauri for these reasons ([Beaver Notes README](https://raw.githubusercontent.com/Beaver-Notes/Beaver-Notes/HEAD/README.md)). Cost: Rust for native code. Fallback if the team can't carry Rust: Electron.

**Desktop-only capabilities (the reason it's "dedicated")**
- **Vault on disk**: folder of `.md` files + `.aura/` index (SQLite). Edit in any editor; file-watcher reconciles.
- **Global Quick Note** hotkey + tray, menu-bar capture, share-target/clipboard capture.
- **Local model runtime**: bundled `llama.cpp` sidecar (or Ollama detection) with GPU/NPU auto-detect; model manager UI (download, verify hash, quantization picker, disk quota).
- **Native OCR + dictation** (Windows/macOS OS APIs, whisper.cpp fallback).
- **OS integration**: system search indexing, deep links `aura://note/<id>`, auto-update (signed), OS keychain for keys.
- **Multi-window**, detachable notes, offline-first by default.

Web = PWA (installable, OPFS, WebGPU AI where available). Mobile later via Tauri mobile or React Native sharing `@aura/core`.

---

## 5. Custom workflow designer

A visual, node-based builder where users compose triggers, AI steps, tools and human approvals — and where **agents are just one node type**.

**Graph model (`@aura/flow`)** — JSON, versioned, diffable, exportable:
```ts
type Node =
  | { type: "trigger"; kind: "manual"|"note.created"|"note.tagged"|"schedule"|"webhook"|"folder.changed" }
  | { type: "action";  tool: ToolName; args: Template }          // create_note, update_note, move, tag, remind, http, email…
  | { type: "ai";      task: "summarize"|"extract"|"classify"|"rewrite"|"embed"|"custom"; model: ModelRef; schema?: JSONSchema }
  | { type: "agent";   agentId: string; goal: Template; maxSteps: number; tools: ToolName[] }
  | { type: "branch";  when: Expr }  | { type: "loop"; over: Expr }
  | { type: "approval"; assignee: Role|User; timeoutMs: number }  // human-in-the-loop
  | { type: "subflow"; flowId: string };
Edge = { from: NodeId; port: "ok"|"error"|"true"|"false"; to: NodeId }
```
- **Executor**: durable (every step persisted → resumable), idempotency keys, retries with backoff, per-run budgets (tokens, steps, wall time), dry-run mode that shows diffs before any write.
- **Designer UX**: canvas (React Flow), live test-run on a sample note with per-node I/O inspector, template gallery ("Meeting → action items → reminders", "Inbox triage", "Weekly digest", "DLP scan on publish"), versioning + rollback, run history reusing the existing Agent telemetry view.
- **Runs where it should**: local/desktop flows execute on-device (offline); org flows execute server-side under the org's policy.
- **Migrate** current 5 built-in agents into flow templates and remove the seeded fake run counts.

---

## 6. AI / multi-agent platform

### 6.1 Provider router (`@aura/ai`)
One interface, many backends: `gemini`, `openai-compatible` (covers vLLM, TGI, Ollama, LM Studio, llama.cpp server, HF Inference Providers/Endpoints), `local-embedded` (desktop sidecar / WebGPU). Policy per workspace: *cloud allowed / self-host only / local only*, with automatic fallback order and **honest failure** (delete the canned fake "summaries"; show "model unavailable" instead).

### 6.2 Agent runtime
- Loop: plan → tool call → observe → reflect, with `maxSteps`, budgets, and approval gates per the existing `autonomyLevel`.
- **Typed tool registry** (JSON-Schema, permission-scoped, auditable) replacing the fixed enum; MCP client so users can plug in external tools.
- **Multi-agent patterns** (start with these three, no more):
  1. *Supervisor → workers* (e.g. Synthesizer fans out to per-folder readers, merges with citations).
  2. *Pipeline* (Extractor → Reviewer → Writer) — maps 1:1 onto workflow graphs.
  3. *Critic/verifier* on any write action touching shared notes.
- **Memory**: short-term = run state; long-term = per-workspace vector + keyword index (hybrid retrieval) with citations back to note blocks.
- **Safety**: notes are untrusted input → prompt-injection guard (tool calls from retrieved text require approval), DLP scan before any outbound call, full audit trail.
- **Evals**: golden-set tests per agent/flow (retrieval hit rate, tool-call validity, task success); run in CI on model swap.

### 6.3 Open-weight / Hugging Face model strategy

> **Research caveat.** My live search returned mostly SEO-style roundups with inconsistent scores, and could not confirm several details (e.g. an unverified "Phi-5"; conflicting EmbeddingGemma licensing). So this section gives **families and selection criteria**, not a fixed leaderboard. **Gate step: read each model card + license on Hugging Face and run our own eval set before adopting.**

**Candidate families (by role)** — sources: [BentoML SLM roundup](https://www.bentoml.com/blog/the-best-open-source-small-language-models), [Labellerr sub-10B list](https://www.labellerr.com/blog/best-small-language-models-under-10b-parameters/), [awesome-open-weight-models](https://github.com/phlx0/awesome-open-weight-models), [Kingy.ai shortlist](https://kingy.ai/news/best-open-weight-ai-models-in-2026-glm-5-2-vs-deepseek-v4-vs-kimi-k2-6-vs-qwen-vs-mistral/):

| Role | Where it runs | Candidate families | Notes |
|---|---|---|---|
| Quick actions (summarize, tags, rewrite) | On-device, 1–4B, Q4 | Qwen small variants, Gemma E2B/E4B-class, Phi-4-mini (3.8B, MIT reported), SmolLM3-3B, Llama 3.2 1B/3B | Sources flag Gemma E-series as strong for size and Phi-4-mini as MIT-licensed; verify cards. |
| Agent / tool-calling brain | Desktop GPU or self-hosted, 7–14B+ | Qwen 8B–9B class, Llama, Mistral, larger MoE via server | Must pass **our** tool-call-validity eval, not just MMLU. |
| Embeddings (semantic search) | On-device | Qwen3-Embedding 0.6B (Apache-2.0 per [paper](https://arxiv.org/html/2506.05176v3)), BGE-M3 (MIT per comparisons), EmbeddingGemma ([HF blog](https://huggingface.co/blog/embeddinggemma); license disputed across sources — check card) | Prefer permissive licenses; Matryoshka/truncated dims to save index space. |
| Reranker | Server/desktop | Qwen3-Reranker family, bge-reranker | Cheap quality win for retrieval. |
| Speech-to-text | On-device | Whisper family (turbo/distil variants), via whisper.cpp | Not verified in my search — confirm sizes/licenses. |
| OCR/vision | On-device | Small VLMs (Gemma/Qwen-VL class) + OS OCR first | Use OS OCR for speed; VLM for layout/handwriting. |
| Safety/DLP | On-device | Small guard classifier + regex/PII rules | Rules first, model second. |

**Fine-tuned models already on HF** — how we use them instead of training from scratch:
1. Search HF by task tags (`summarization`, `text-classification`, `token-classification`/PII, `feature-extraction`, `function-calling`) and filter: license ∈ {Apache-2.0, MIT, permissive}, GGUF/ONNX availability, downloads/likes, last update.
2. Build **Aura-Bench** (200–500 real-style note tasks, synthetic/anonymized): summarize, action-item extraction (F1), tagging, folder routing, tool-call JSON validity, retrieval recall@k, latency/RAM on target hardware.
3. Shortlist 2–3 per role, quantize (GGUF Q4_K_M / ONNX int4), re-benchmark.
4. Only if a gap remains: **LoRA/QLoRA fine-tune** a permissive base on consented, anonymized task data (e.g., note → structured action items), publish adapter, ship via model manager. Never train on customer notes without explicit opt-in.
5. **Model manager** in desktop: catalog JSON (id, license, size, hash, min RAM, tasks), signed, so enterprises can pin an allow-list.

**Licensing guardrail:** commercial use must be checked per card (Apache-2.0/MIT fine; Llama/Gemma-style custom licenses have usage terms; some "open-weight" models are non-commercial). Store license in the catalog and surface it in admin policy.

---

## 7. Roadmap

| Phase | Weeks | Deliverables | Exit criteria |
|---|---|---|---|
| **0. Hardening** | 1–3 | Verify auth tokens server-side; remove header identity; purge `notes-db_*.json` from git history + ignore; rate limit/CORS/Helmet; add Vitest + Playwright smoke + CI; delete fake AI fallbacks and seeded run counts | No unauthenticated data access; CI green |
| **1. Core extraction** | 3–8 | Monorepo; `@aura/core` note/block model; per-note sync API (replace whole-array POST); SQLite+FTS client store; split god components | Two browsers edit same account with no data loss |
| **2. Editor & Notes parity** | 8–14 | TipTap editor, checklists, attachments, subfolders, smart folders, backlinks, lock/E2E vaults, importers (Apple Notes/Markdown/Notion), hybrid search | Parity checklist in §2 ≥ 90% |
| **3. AI router + local models** | 10–16 | Provider router, OpenAI-compatible adapter, embeddings + semantic search, Aura-Bench, model catalog | Local-only mode works end to end |
| **4. Desktop (Tauri)** | 14–22 | Vault-on-disk, Quick Note hotkey, llama.cpp sidecar, model manager, auto-update, signed installers (Win/mac/Linux) | Beta to 50 users; cold start < 1s target |
| **5. Workflow designer + agents v2** | 18–28 | `@aura/flow` executor, canvas, templates, approval nodes, MCP tools, supervisor/pipeline/critic patterns, evals in CI | 5 template flows run reliably; eval gates on |
| **6. Collaboration & enterprise** | 26–36 | Yjs live collab, shared folders, SSO/SCIM, DLP policies, per-tenant AI policy & metering, audit export | Pilot org live |
| **7. Mobile / polish** | 36+ | Mobile client, scanning/handwriting, widgets | — |

Phases 3 and 4 can overlap (different owners); Phase 5 depends on 1 and 3.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Scope too large for the team | Strict phase gates; Phase 0–2 alone already ships a credible product |
| Sync bugs corrupt notes | Op-log + snapshots, daily local backups, property tests on merge, "restore version" UI |
| Local models too weak/slow | Aura-Bench gates; always keep cloud/self-host fallback per policy; smaller task-specific models |
| Model license surprises | License in catalog, admin allow-list, legal check in the adoption gate |
| Prompt injection via notes | Untrusted-content tagging, approval on risky tools, outbound DLP |
| Rust skill gap for Tauri | Keep native layer thin (file watcher, sidecar, hotkey); Electron as fallback |

---

## 9. Immediate next actions (this week)

1. Fix auth: require and verify Firebase ID token; stop trusting `x-user-email`.
2. `git rm --cached notes-db_*.json folders-db_*.json`, add to `.gitignore`, decide on history rewrite for personal data.
3. Add Vitest + CI (`tsc`, tests, build).
4. Replace `getFallbackAiResponse` fake content with explicit "AI unavailable" states.
5. Stand up Aura-Bench v0 (30 tasks) and the HF candidate shortlist worksheet.
6. Spike: Tauri shell wrapping the current Vite build + `llama.cpp` sidecar hello-world.
