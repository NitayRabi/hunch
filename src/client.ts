import { TypeSafeClient } from "@typesafe-ai/sdk";
import { OpenJevClient } from "./openjev.js";
import { EngineType, SystemOneClient } from "./types.js";

const DEFAULT_API_KEY =
  "apikey_2102d578ba815fd14854958fb206d61dfa72_6a79efa602f5f1355e7906a716fbc70152958c9b9874a5d5bb258698f7f557a2";

export interface CreateClientOptions {
  engine?: EngineType;
  apiKey?: string;
  localUrl?: string;
  openjevUrl?: string;
  model?: string;
  openjevModel?: string;
  timeoutMs?: number;
}

/**
 * Resolves the active System One decision engine.
 * Default is always "jev" (TypeSafe Cloud API).
 * If a local URL is provided (via CLI flag or env var) or --local is passed, it switches to "openjev".
 */
export function resolveEngine(options?: CreateClientOptions): EngineType {
  if (options?.engine) return options.engine;

  // If a local URL is explicitly passed via options or env vars, switch to local engine
  if (
    options?.localUrl ||
    options?.openjevUrl ||
    process.env.OPENJEV_URL ||
    process.env.LOCAL_URL ||
    process.env.OPENJEV_BASE_URL ||
    process.env.LOCAL_LLM_URL ||
    process.env.USE_OPENJEV === "1" ||
    process.env.USE_OPENJEV === "true" ||
    process.env.USE_LOCAL === "1" ||
    process.env.USE_LOCAL === "true"
  ) {
    return "openjev";
  }

  const envEngine = process.env.JEV_ENGINE?.toLowerCase();
  if (
    envEngine === "openjev" ||
    envEngine === "open-jev" ||
    envEngine === "local"
  ) {
    return "openjev";
  }

  return "jev";
}

/**
 * Factory for creating either JEV (TypeSafe Cloud System One) or OpenJEV (Local OpenAI-compatible logits readout).
 * No model weights or binaries are bundled; communication is over standard HTTP.
 */
export function createClient(
  optionsOrApiKey?: string | CreateClientOptions
): { client: SystemOneClient; engine: EngineType } {
  let opts: CreateClientOptions = {};
  if (typeof optionsOrApiKey === "string") {
    opts = { apiKey: optionsOrApiKey };
  } else if (optionsOrApiKey) {
    opts = optionsOrApiKey;
  }

  const engine = resolveEngine(opts);

  if (engine === "openjev") {
    const baseUrl =
      opts.localUrl ||
      opts.openjevUrl ||
      process.env.OPENJEV_URL ||
      process.env.LOCAL_URL ||
      process.env.OPENJEV_BASE_URL ||
      process.env.LOCAL_LLM_URL ||
      "http://127.0.0.1:8080/v1";

    const model =
      opts.model ||
      opts.openjevModel ||
      process.env.OPENJEV_MODEL ||
      process.env.LOCAL_MODEL ||
      process.env.LOCAL_LLM_MODEL ||
      "gemma-4-E4B_q4_0-it";

    const openjevClient = new OpenJevClient({
      baseUrl,
      model,
      timeoutMs: opts.timeoutMs || 15000,
    });
    return { client: openjevClient, engine: "openjev" };
  }

  const key = opts.apiKey || process.env.TYPESAFE_API_KEY || DEFAULT_API_KEY;
  const jevClient = new TypeSafeClient({
    apiKey: key,
    timeout: opts.timeoutMs || 15000,
    retry: {
      maxRetries: 3,
      backoffInitialMs: 400,
      backoffMaxMs: 4000,
    },
  });

  return { client: jevClient, engine: "jev" };
}
