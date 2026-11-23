# Handoff: AI (Phase 3)

## Layout
- `src/ai/types.ts`, `jsonSchema.ts`, `router.ts` - provider-agnostic types, JSON-schema-subset validator, `AiRouter`.
- `src/ai/adapters/` - `openaiCompatible.ts` (tested against an in-test HTTP server), `gemini.ts` (server-only; tested only via typecheck, no live call), `localEmbedded.ts` (interface + stub, NOT functional).
- `src/ai/retrieval.ts` - chunking, cosine, in-memory vector store, BM25, RRF, `HybridIndex`, citations, `wrapUntrusted`.
- `server/ai/router.ts` - `createAiRouter(deps)` Express router (chat, complete, embed, models). NOT mounted.
- `models/catalog.{json,schema.json,ts}`, `bench/` (tasks, metrics, runner, CLI), `tests/ai/` (70 tests).

## Wiring needed from the lead
1. Mount (after `requireAuth` on `/api`, which sets `req.userEmail`):
```ts
import { createAiRouter } from "./ai/router";
import { AiRouter } from "../src/ai/router";
import { OpenAiCompatibleProvider } from "../src/ai/adapters/openaiCompatible";
import { GeminiProvider } from "../src/ai/adapters/gemini";
const providers = [];
if (process.env.AURA_LLM_BASE_URL) providers.push(new OpenAiCompatibleProvider({ id: "self-host", baseUrl: process.env.AURA_LLM_BASE_URL, apiKey: process.env.AURA_LLM_API_KEY, locality: "self-host", defaultModel: process.env.AURA_LLM_MODEL, defaultEmbeddingModel: process.env.AURA_EMBED_MODEL }));
if (process.env.GEMINI_API_KEY) providers.push(new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY }));
app.use("/api/ai", createAiRouter({ router: new AiRouter({ providers }), resolvePolicy: (email, ws) => /* per-workspace policy from DB; default "cloud-allowed" */ "cloud-allowed", meter: /* optional AiMeter */ undefined }));
```
   Note: mount `/api/ai` BEFORE or independent of legacy `/api/ai/action` (legacy path is `/action`, no collision with chat/complete/embed/models).
2. New env vars: `AURA_LLM_BASE_URL`, `AURA_LLM_API_KEY`, `AURA_LLM_MODEL`, `AURA_EMBED_MODEL` (suggested; add to `.env.example`).
3. Policy storage: `resolvePolicy` must read a server-side per-workspace setting. Clients cannot choose policy; they may only send `sensitivity:"locked"` to restrict to local providers (server cannot see E2E content anyway; local providers are not reachable from the server, so locked requests via the API will return 403 by design - locked notes must be processed on-device).
4. Metering: implement `AiMeter` (check/record); recommended backing store Mongo/Redis. Not implemented.
5. Frontend: replace the canned fallback summaries with the typed errors (`AI_UNAVAILABLE`, `POLICY_BLOCKED`, `TIMEOUT`, `BAD_OUTPUT`) - show "model unavailable".
6. Desktop: llama.cpp `llama-server` sidecar => `OpenAiCompatibleProvider({locality:"local", baseUrl:"http://127.0.0.1:<port>/v1"})`. `LocalEmbeddedProvider` is only for non-HTTP engines (transformers.js) and needs a `LocalEngine` implementation.
7. Agent runtime (other phase) should wrap retrieved/note text with `wrapUntrusted` and require approval for tool calls derived from it.

## Model research
Method: read the Hugging Face model API (`huggingface.co/api/models/<repo>`) on 2026-11-23 through a page-summarising fetch tool (not raw JSON), so values are "as reported by that tool"; re-verify before adoption. 12 candidates recorded in `models/catalog.json`.

Confirmed (license string, parameter count from safetensors metadata): Phi-4-mini-instruct (mit, 3.84B), SmolLM3-3B (apache-2.0, 3.08B), Llama-3.2-3B-Instruct (llama3.2, gated, 3.21B), Qwen3-8B (apache-2.0, 8.19B), Qwen3-Embedding-0.6B (apache-2.0, 0.60B), EmbeddingGemma-300m (license `gemma`, gated - resolves the plan's disputed-license question: custom Gemma terms, not Apache/MIT), Qwen3-Reranker-0.6B and bge-reranker-v2-m3 (apache-2.0), whisper-large-v3-turbo (mit, 0.81B), Granite-Guardian-3.2-5b (apache-2.0, 5.78B). Qwen2.5-VL-3B-Instruct has no `license` field; `license_name` is `qwen-research` -> treated as non-commercial, excluded from the enterprise allow-list (LICENSE file not read).
Partially confirmed: BAAI/bge-m3 - license `mit` and `onnx/model.onnx` present, parameter count not returned, so `verified:false`.
NOT confirmed / left null for every entry: file sizes, sha256, min RAM, GGUF availability (only formats observed in the official repo are listed; none of the official repos showed GGUF; third-party GGUF/ONNX conversions were not checked), any benchmark score, tool-call validity. Not checked: Phi "5", Gemma E2B/E4B, distil-whisper, a permissive OCR/VLM alternative (the only OCR/vision candidate is non-commercial; recommend OS OCR first).
Commercial-use field: `yes` only for permissive licenses; `unknown` for Gemma/Llama custom terms (legal review).

## Not done
- No live test of Gemini adapter or any real local/self-hosted model; no real Aura-Bench numbers (the 36 tasks are synthetic harness fixtures; the oracle-fake test only proves scoring plumbing).
- No reranker stage in `HybridIndex`; no persistent vector store (interface + in-memory only); no ANN index.
- Router has no per-model routing by task; chain order is static.
- DLP scan before outbound calls is not implemented here.
- `bench/run.ts` CLI is untested (needs a live endpoint): `BENCH_BASE_URL=... BENCH_MODEL=... npx tsx bench/run.ts`.
