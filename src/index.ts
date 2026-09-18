#!/usr/bin/env node
import * as path from "node:path";
import { createClient } from "./client.js";
import { traverseRepository } from "./traverser.js";
import { formatResultMarkdown, formatResultJson } from "./formatter.js";
import { TraversalConfig, EngineType } from "./types.js";
import {
  renderHunchEvent,
  renderCodexStart,
  renderCodexSummary,
  c,
} from "./ui.js";

function parseArgs(args: string[]): {
    task: string;
    dir: string;
    engine?: EngineType;
    localUrl?: string;
    model?: string;
    json: boolean;
    verbose: boolean;
    codex: boolean;
    maxFiles: number;
    maxRounds: number;
  } {
    let task = "";
    let dir = process.cwd();
    let engine: EngineType | undefined = undefined;
    let localUrl: string | undefined = undefined;
    let model: string | undefined = undefined;
    let json = false;
    let verbose = false;
    let codex = false;
    let maxFiles = 16;
    let maxRounds = 8;
  
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--dir" || arg === "-d") {
        dir = args[++i] || dir;
      } else if (arg === "--local-url" || arg === "--url") {
        localUrl = args[++i];
        engine = "openjev";
      } else if (arg === "--local") {
        engine = "openjev";
      } else if (arg === "--cloud") {
        engine = "hunch";
      } else if (arg === "--engine") {
        const val = (args[++i] || "").toLowerCase();
        if (val === "local" || val === "openjev") {
          engine = "openjev";
        } else if (val === "cloud" || val === "hunch") {
          engine = "hunch";
        }
      } else if (arg === "--model" || arg === "-m") {
        model = args[++i];
      } else if (arg === "--json") {
        json = true;
      } else if (arg === "--verbose" || arg === "-v") {
        verbose = true;
      } else if (arg === "--codex") {
        codex = true;
      } else if (arg === "--max-files") {
        maxFiles = parseInt(args[++i] || "16", 10);
      } else if (arg === "--max-rounds") {
        maxRounds = parseInt(args[++i] || "8", 10);
      } else if (arg === "--help" || arg === "-h") {
        console.log(`
  Hunch - System One Repository Context Finder
  
  Usage:
    hunch "<task description>" [options]
    npx hunch "<task description>" [options]
    npx tsx src/index.ts "<task description>" [options]
  
  Engine Options (Default: TypeSafe JEV Cloud API):
    --local-url <url>       Use local System One engine at specified URL (e.g. http://127.0.0.1:8080/v1)
    --local                 Use local System One engine at default endpoint (http://127.0.0.1:8080/v1)
    --model, -m <model>     Target model name for local inference (default: gemma-4-E4B_q4_0-it)
    --cloud                 Explicitly use TypeSafe JEV cloud API

  Options:
    --dir, -d <path>        Target repository path (default: current directory)
    --verbose, -v           Show live traversal steps, probabilities, and decisions
    --codex                 Run local Codex CLI with pre-gathered context at the end
    --json                  Output full structured JSON payload
    --max-files <num>       Maximum files to inspect (default: 16)
    --max-rounds <num>      Maximum traversal rounds (default: 8)
    --help, -h              Show this help message
  
  Environment Variables:
    HUNCH_LOCAL_URL, OPENJEV_URL, LOCAL_URL   Set local server endpoint (activates local engine)
    HUNCH_MODEL, OPENJEV_MODEL               Set default model name for local inference
    HUNCH_API_KEY, TYPESAFE_API_KEY          API Key for default TypeSafe JEV cloud API
  `);
        process.exit(0);
      } else if (!arg.startsWith("-")) {
        if (task) {
          task += " " + arg;
        } else {
          task = arg;
        }
      }
    }
  
    if (!task.trim()) {
      console.error("Error: Task description is required.");
      console.error('Usage: hunch "<task description>" [--dir <repo-dir>]');
      process.exit(1);
    }
  
    return {
      task: task.trim(),
      dir: path.resolve(dir),
      engine,
      localUrl,
      model,
      json,
      verbose,
      codex,
      maxFiles,
      maxRounds,
    };
  }
  
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--hook")) {
    const { runHook } = await import("./hook.js");
    await runHook();
    return;
  }
  const { task, dir, engine, localUrl, model, json, verbose, codex, maxFiles, maxRounds } = parseArgs(args);

  const { client } = createClient({
    engine,
    localUrl,
    model,
  });

  const config: TraversalConfig = {
    rootDir: dir,
    task,
    dirThreshold: 0.40,
    fileThreshold: 0.45,
    snippetThreshold: 0.45,
    maxFilesToRead: maxFiles,
    maxDepth: 6,
    maxRounds,
    verbose,
    onEvent: json ? undefined : renderHunchEvent,
  };

  try {
    const result = await traverseRepository(client, config);
    const markdown = formatResultMarkdown(result);

    if (json) {
      console.log(formatResultJson(result));
    } else if (!codex) {
      console.log(markdown);
    }

    if (codex) {
      renderCodexStart("local", "Tiel-Coder-35B-A3B-MTP-UD-Q4_K_XL");

      const codexPrompt = `Task: ${task}\n\nPRE-GATHERED REPOSITORY CONTEXT:\n${markdown}\n\nINSTRUCTIONS FOR AGENT:\nYou are provided with pre-gathered repository context and exact file snippets above.\nDO NOT execute shell or terminal commands (no bash, no grep, no find).\nAct directly on the pre-gathered context and target files provided above to analyze the bugs and output the complete, corrected code implementation.`;

      const { runCodex } = await import("./codex.js");

      console.log(`${c.dim}Streaming agent solution...${c.reset}\n`);

      const codexRes = await runCodex(codexPrompt, dir, {
        profile: "local",
        disableShell: true,
        onEvent: (event) => {
          if (event.type === "tool_call") {
            console.log(`\n${c.yellow}⚙️  [Codex Tool #${event.index}]${c.reset} ${event.command}`);
          }
        },
      });

      renderCodexSummary(
        codexRes.durationMs,
        result.durationMs,
        codexRes.inputTokens,
        codexRes.outputTokens,
        codexRes.toolCallsCount,
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n${c.red}Traversal Error:${c.reset} ${message}`);
    process.exit(1);
  }
}

main();
