import { TypeSafeClient } from "@typesafe-ai/sdk";

const DEFAULT_API_KEY =
  "apikey_2102d578ba815fd14854958fb206d61dfa72_6a79efa602f5f1355e7906a716fbc70152958c9b9874a5d5bb258698f7f557a2";

export function createClient(apiKey?: string): TypeSafeClient {
  const key = apiKey || process.env.TYPESAFE_API_KEY || DEFAULT_API_KEY;
  return new TypeSafeClient({
    apiKey: key,
    timeout: 15000,
    retry: {
      maxRetries: 3,
      backoffInitialMs: 400,
      backoffMaxMs: 4000,
    },
  });
}
