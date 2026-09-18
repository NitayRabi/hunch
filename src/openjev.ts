/**
 * OpenJEV Client - Direct Categorical Logit Readout Engine
 * Based on openjev (https://github.com/TheoLeeCJ/openjev)
 *
 * Directly extracts typed decision probabilities via next-token logits
 * from local open models (e.g., fastcontext 4B / Qwen 4B) with zero decoding loops.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIRECT_SYSTEM =
  "You are an expert codebase context evaluator. Apply the supplied criterion to the supplied evidence. " +
  "Choose exactly one listed option. Respond with only its uppercase letter, with no explanation or reasoning.";

export interface OpenJevConfig {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  concurrency?: number;
}

export interface SystemOneRequest {
  state: string | Record<string, any> | Array<any>;
  questions: Record<string, any>;
  model?: string;
}

export interface SystemOneResponse {
  answers: Record<string, any>;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  durationMs?: number;
}

export class OpenJevClient {
  private baseUrl: string;
  private defaultModel: string;
  private timeoutMs: number;
  private concurrency: number;

  constructor(config: OpenJevConfig = {}) {
    this.baseUrl =
      config.baseUrl ||
      process.env.OPENJEV_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      "http://127.0.0.1:8080/v1";
    this.defaultModel =
      config.model ||
      process.env.OPENJEV_MODEL ||
      "fastcontext-1.0-4b-sft-q4_k_m";
    this.timeoutMs = config.timeoutMs || 15000;
    this.concurrency = config.concurrency || 8;
  }

  /**
   * Evaluates questions against state in parallel via OpenJEV direct categorical readout.
   */
  async systemOne(
    request: SystemOneRequest,
    _options: Record<string, any> = {}
  ): Promise<SystemOneResponse> {
    const startTime = Date.now();
    const model = request.model || this.defaultModel;
    const questions = request.questions;
    const qKeys = Object.keys(questions);

    if (qKeys.length === 0) {
      return {
        answers: {},
        model,
        durationMs: Date.now() - startTime,
      };
    }

    let parsedState: any = request.state;
    if (typeof parsedState === "string") {
      try {
        parsedState = JSON.parse(parsedState);
      } catch {
        // Keep as string if not valid JSON
      }
    }

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const answers: Record<string, any> = {};

    // Execute questions in chunks to respect concurrency
    for (let i = 0; i < qKeys.length; i += this.concurrency) {
      const chunkKeys = qKeys.slice(i, i + this.concurrency);
      const promises = chunkKeys.map(async (key) => {
        const q = questions[key];
        const result = await this.evaluateSingleQuestion(
          model,
          parsedState,
          q
        );
        return { key, result };
      });

      const chunkResults = await Promise.all(promises);
      for (const { key, result } of chunkResults) {
        answers[key] = result.answer;
        totalPromptTokens += result.usage?.prompt_tokens || 0;
        totalCompletionTokens += result.usage?.completion_tokens || 0;
      }
    }

    return {
      answers,
      model,
      usage: {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalPromptTokens + totalCompletionTokens,
      },
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Formats and dispatches a single question to the OpenJEV logit endpoint.
   */
  private async evaluateSingleQuestion(
    model: string,
    evidence: any,
    q: any
  ): Promise<{ answer: any; usage?: { prompt_tokens: number; completion_tokens: number } }> {
    const qType = q.type || "noul";
    let criterion = "";
    let options: Array<{ id: string; description: string }> = [];

    if (qType === "noul") {
      criterion =
        typeof q.instructions === "string"
          ? q.instructions
          : JSON.stringify(q.instructions || "Is this statement accurate/relevant?");
      const trueDesc =
        q.criteria?.true ?? "Yes, this statement is accurate / meets the criterion / is relevant";
      const falseDesc =
        q.criteria?.false ?? "No, this statement is inaccurate / does not meet the criterion / is irrelevant";
      
      // We present Negative as Option A and Positive as Option B to counterbalance first-token bias
      options = [
        { id: "false", description: String(falseDesc) },
        { id: "true", description: String(trueDesc) },
      ];
    } else if (qType === "choice") {
      criterion =
        typeof q.instructions === "string"
          ? q.instructions
          : JSON.stringify(q.instructions || "Choose the best matching category:");
      const criteriaObj = q.criteria || {};
      options = Object.keys(criteriaObj).map((key) => ({
        id: key,
        description: `${key}: ${criteriaObj[key] ?? key}`,
      }));
    } else if (qType === "score") {
      criterion =
        typeof q.instructions === "string"
          ? q.instructions
          : JSON.stringify(q.instructions || "Score according to the rubric:");
      const criteriaList = Array.isArray(q.criteria) ? q.criteria : [];
      options = criteriaList.map((item: any, idx: number) => ({
        id: String(idx),
        description: `Score ${idx}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`,
      }));
    }

    if (options.length < 2) {
      options.push({ id: "fallback", description: "None / Not applicable" });
    }

    // OpenJEV payload schema
    const payload = {
      evidence,
      criterion,
      options: options.map((opt, idx) => ({
        letter: LETTERS[idx],
        description: opt.description,
      })),
    };

    const requestBody = {
      model,
      messages: [
        { role: "system", content: DIRECT_SYSTEM },
        { role: "user", content: JSON.stringify(payload) },
      ],
      max_tokens: 1,
      temperature: 0.0,
      logprobs: true,
      top_logprobs: 20,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OpenJEV HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      const usage = data.usage;
      const topLogprobs = data.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs || [];

      // Extract logprobs for option letters
      const logprobMap = new Map<string, number>();
      for (const item of topLogprobs) {
        const cleanToken = (item.token || "").trim().toUpperCase();
        if (cleanToken.length === 1 && !logprobMap.has(cleanToken)) {
          logprobMap.set(cleanToken, item.logprob);
        }
      }

      // Default baseline logprob for non-returned letters
      const minLogprob = -15.0;
      const rawScores = options.map((_, idx) => {
        const letter = LETTERS[idx];
        return logprobMap.has(letter) ? logprobMap.get(letter)! : minLogprob;
      });

      // Numerically stable softmax
      const maxScore = Math.max(...rawScores);
      const exps = rawScores.map((s) => Math.exp(s - maxScore));
      const sumExps = exps.reduce((acc, val) => acc + val, 0);
      const probabilities = exps.map((val) => (sumExps > 0 ? val / sumExps : 1 / options.length));

      // Build typed answer
      if (qType === "noul") {
        // Since options are [false, true], true is at index 1
        const noulProb = probabilities[1] ?? 0.5;
        return {
          answer: {
            type: "noul",
            noul: Number(noulProb.toFixed(4)),
          },
          usage,
        };
      } else if (qType === "choice") {
        let bestIdx = 0;
        let maxProb = -1;
        const probMap: Record<string, number> = {};
        options.forEach((opt, idx) => {
          const p = Number((probabilities[idx] ?? 0).toFixed(4));
          probMap[opt.id] = p;
          if (p > maxProb) {
            maxProb = p;
            bestIdx = idx;
          }
        });
        return {
          answer: {
            type: "choice",
            choice: options[bestIdx]?.id || options[0].id,
            confidence: Number(maxProb.toFixed(4)),
            probabilities: probMap,
          },
          usage,
        };
      } else {
        // score
        let expectedScore = 0;
        let maxProb = -1;
        const probMap: Record<string, number> = {};
        const legend: Record<string, any> = {};

        options.forEach((opt, idx) => {
          const p = Number((probabilities[idx] ?? 0).toFixed(4));
          probMap[String(idx)] = p;
          legend[String(idx)] = opt.description;
          expectedScore += idx * p;
          if (p > maxProb) {
            maxProb = p;
          }
        });

        return {
          answer: {
            type: "score",
            score: Number(expectedScore.toFixed(2)),
            confidence: Number(maxProb.toFixed(4)),
            legend,
            probabilities: probMap,
          },
          usage,
        };
      }
    } catch (err) {
      console.warn("[OpenJEV Warning] Evaluation failed, using conservative fallback:", err);
      if (qType === "noul") {
        return { answer: { type: "noul", noul: 0.2 } };
      } else if (qType === "choice") {
        return {
          answer: {
            type: "choice",
            choice: options[0]?.id || "reference",
            confidence: 0.5,
            probabilities: {},
          },
        };
      } else {
        return {
          answer: {
            type: "score",
            score: 0.0,
            confidence: 0.5,
            legend: {},
            probabilities: {},
          },
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
