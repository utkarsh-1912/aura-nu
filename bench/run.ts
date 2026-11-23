// CLI: BENCH_BASE_URL=http://localhost:11434/v1 BENCH_MODEL=<model> [BENCH_EMBED_MODEL=<model>] [BENCH_API_KEY=..] npx tsx bench/run.ts
// Runs against whatever server you point it at. Prints a table; writes nothing to the repo.
import { readFileSync } from "node:fs";
import { OpenAiCompatibleProvider } from "../src/ai/adapters/openaiCompatible";
import { formatTable, runBench, type BenchTask } from "./runner";

const baseUrl = process.env.BENCH_BASE_URL;
const model = process.env.BENCH_MODEL;
if (!baseUrl || !model) {
  console.error("Set BENCH_BASE_URL and BENCH_MODEL (an OpenAI-compatible endpoint, e.g. Ollama/vLLM/llama.cpp server).");
  process.exit(2);
}
const provider = new OpenAiCompatibleProvider({
  id: "bench", baseUrl, locality: "local", defaultModel: model, defaultEmbeddingModel: process.env.BENCH_EMBED_MODEL, apiKey: process.env.BENCH_API_KEY,
  jsonMode: (process.env.BENCH_JSON_MODE as any) ?? "json_schema",
});
const file = JSON.parse(readFileSync(new URL("./tasks/aura-bench-v0.json", import.meta.url), "utf8"));
const { summary } = await runBench(file.tasks as BenchTask[], provider, { model, embedModel: process.env.BENCH_EMBED_MODEL });
console.log(formatTable(summary, model));
