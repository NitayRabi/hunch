#!/usr/bin/env node
import * as path from "node:path";
import { createClient } from "./client.js";
import { traverseRepository } from "./traverser.js";
import { formatResultMarkdown, formatResultJson } from "./formatter.js";
import { TraversalConfig } from "./types.js";

function parseArgs(args: string[]): {
    task: string;
    dir: string;
    json: boolean;
    verbose: boolean;
    codex: boolean;
    maxFiles: number;
    maxRounds: number;
  } {
    let task = "";
    let dir = process.cwd();
    let json = false;
    let verbose = false;
    let codex = false;
    let maxFiles = 16;
    let maxRounds = 8;
  
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--dir" || arg === "-d") {
        dir = args[++i] || dir;
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
  JEV Repo Traverser - TypeSafe AI Repository Context Finder
  
  Usage:
    jev-researcher "<task description>" [options]
    npx tsx src/index.ts "<task description>" [options]
  
  Options:
    --dir, -d <path>     Target repository directory (default: current directory)
    --verbose, -v        Show live traversal steps, probabilities, and decisions
    --codex              Run local Codex CLI with pre-gathered context at the end
    --json               Output full structured JSON payload
    --max-files <num>    Maximum files to inspect (default: 16)
    --max-rounds <num>   Maximum traversal rounds (default: 8)
    --help, -h           Show this help message
  
  Environment Variables:
    TYPESAFE_API_KEY     TypeSafe API Key (falls back to configured default)
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
      console.error('Usage: jev-researcher "<task description>" [--dir <repo-dir>]');
      process.exit(1);
    }
  
    return {
      task: task.trim(),
      dir: path.resolve(dir),
      json,
      verbose,
      codex,
      maxFiles,
      maxRounds,
    };
  }
  
  async function main() {
    const args = process.argv.slice(2);
    const { task, dir, json, verbose, codex, maxFiles, maxRounds } = parseArgs(args);
  
    const client = createClient();
  
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
    };
  
    try {
      const result = await traverseRepository(client, config);
      const markdown = formatResultMarkdown(result);
  
      if (json) {
        console.log(formatResultJson(result));
      } else {
        console.log(markdown);
      }
  
      if (codex) {
        console.log("\n=======================================================");
        console.log("[JEV + Codex] Handing off to local Codex CLI...");
        console.log("=======================================================\n");
  
        const codexPrompt = `Task: ${task}
  
  PRE-GATHERED REPOSITORY CONTEXT:
  ${markdown}
  
  INSTRUCTIONS FOR AGENT:
  You are provided with pre-gathered repository context and exact file snippets above.
  DO NOT spend time or tokens searching or exploring the repository; act directly on the pre-gathered context and target files to implement the task.`;
  
        const { runCodex } = await import("./codex.js");
        const codexRes = await runCodex(codexPrompt, dir, { profile: "local", disableShell: true });
  
        console.log("### Codex Final Response:\n");
        console.log(codexRes.finalMessage);
        console.log("\n---");
        console.log(`[Codex Execution Metrics]`);
        console.log(`Duration: ${(codexRes.durationMs / 1000).toFixed(2)}s (JEV: ${(result.durationMs / 1000).toFixed(2)}s, Total: ${((codexRes.durationMs + result.durationMs) / 1000).toFixed(2)}s)`);
        console.log(`Tokens: Input=${codexRes.inputTokens}, Output=${codexRes.outputTokens}, Total=${codexRes.totalTokens}`);
        console.log(`Tool Calls Made by Codex: ${codexRes.toolCallsCount}`);
        console.log("-------------------------------------------------------\n");
      }
    } catch (err) {
      console.error("Fatal error during repository traversal:", err);
      process.exit(1);
    }
  }

main();
