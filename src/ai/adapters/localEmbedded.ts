import { AiError, AiProvider, ChatRequest, ChatResponse, EmbedRequest, EmbedResponse } from "../types";

/**
 * Contract for an in-process / sidecar inference engine on the user's device.
 *
 * NOT IMPLEMENTED in this repo. Intended plug-ins (none are wired or tested here):
 *  - Desktop (Tauri/Electron): a llama.cpp `llama-server` sidecar. In that case prefer
 *    OpenAiCompatibleProvider with locality "local" pointed at 127.0.0.1; this interface
 *    is only needed for engines that are not HTTP (e.g. native bindings).
 *  - Web/desktop: transformers.js (ONNX, WebGPU/WASM) for embeddings and small models.
 * The host app supplies an engine; until it does, the provider fails honestly with AI_UNAVAILABLE.
 */
export interface LocalEngine {
  isReady(): Promise<boolean>;
  chat?(req: ChatRequest): Promise<ChatResponse>;
  embed?(req: EmbedRequest): Promise<EmbedResponse>;
}

export class LocalEmbeddedProvider implements AiProvider {
  readonly id: string;
  readonly locality = "local" as const;
  constructor(private engine: LocalEngine | null = null, id = "local-embedded") { this.id = id; }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (!this.engine?.chat || !(await this.engine.isReady())) {
      throw new AiError("AI_UNAVAILABLE", "No local model engine is installed or ready on this device.", { provider: this.id });
    }
    return this.engine.chat(req);
  }
  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    if (!this.engine?.embed || !(await this.engine.isReady())) {
      throw new AiError("AI_UNAVAILABLE", "No local embedding engine is installed or ready on this device.", { provider: this.id });
    }
    return this.engine.embed(req);
  }
}
