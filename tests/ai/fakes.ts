import { AiError, AiProvider, ChatRequest, ChatResponse, EmbedRequest, EmbedResponse, ProviderLocality, StreamChunk } from "../../src/ai/types";

export const ok = (text: string, provider = "fake"): ChatResponse => ({
  text, toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, model: "m", provider, finishReason: "stop",
});

export class FakeProvider implements AiProvider {
  calls = 0;
  seen: ChatRequest[] = [];
  constructor(
    public id: string,
    public locality: ProviderLocality,
    public script: Array<ChatResponse | AiError | Error | ((r: ChatRequest) => Promise<ChatResponse>)> = [ok("hi")],
  ) {}
  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.seen.push(req);
    const step = this.script[Math.min(this.calls++, this.script.length - 1)];
    if (typeof step === "function") return step(req);
    if (step instanceof Error) throw step;
    return { ...step, provider: this.id };
  }
  streamScript: Array<StreamChunk | Error> | null = null;
  stream = (req: ChatRequest): AsyncIterable<StreamChunk> => {
    const self = this;
    this.calls++;
    return (async function* () {
      for (const s of self.streamScript ?? [{ delta: "a" }, { delta: "b" }, { done: true }]) {
        if (s instanceof Error) throw s;
        yield s;
      }
    })();
  };
  embed = async (req: EmbedRequest): Promise<EmbedResponse> => {
    this.calls++;
    return { vectors: req.input.map((t) => fakeEmbed(t)), model: "e", provider: this.id, usage: { promptTokens: null, completionTokens: null, totalTokens: null } };
  };
}

/** Deterministic bag-of-words hashing embedding (dimension 64). Texts sharing words are similar. */
export function fakeEmbed(text: string, dim = 64): number[] {
  const v = new Array(dim).fill(0);
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) { h ^= w.charCodeAt(i); h = Math.imul(h, 16777619); }
    v[Math.abs(h) % dim] += 1;
  }
  return v;
}
