#!/usr/bin/env node
import * as readline from "node:readline";
import { createClient } from "./client.js";
import { traverseRepository } from "./traverser.js";
import { classifyPromptIntent } from "./evaluator.js";
import { formatResultMarkdown } from "./formatter.js";
import { renderHookStatus, c } from "./ui.js";
import { TraversalConfig } from "./types.js";

/**
 * Hook mode: Reads a JSON payload from stdin (e.g. from Claude Code / Codex UserPromptSubmit hook),
 * classifies the prompt with JEV/OpenJEV System One to see if repo search is warranted,
 * and if so, runs speculative Hunch context traversal against the workspace, returning additionalContext.
 */
export async function runHook() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  let inputData = "";
  try {
    for await (const line of rl) {
      inputData += line + "\n";
    }
  } catch (err) {
    // Stdin read error — treat as no input and exit silently so the caller's
    // prompt flow isn't disrupted, matching the empty-input passthrough above.
    process.stderr.write(`${c.red}[JEV System One]${c.reset} Hook failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(0);
  } finally {
    rl.close();
  }

  if (!inputData.trim()) {
    process.exit(0);
  }

  try {
    const event = JSON.parse(inputData);
    if (typeof event !== "object" || event === null || Array.isArray(event)) {
      process.stderr.write(`${c.red}[JEV System One]${c.reset} Hook failed: expected a JSON object payload\n`);
      process.exit(0);
    }

    const prompt = event.prompt || event.message || event.task || "";
    if (!prompt.trim()) {
      process.exit(0);
    }

    // Skip trivially short prompts
    if (prompt.trim().length < 4) {
      process.exit(0);
    }

    const { client, engine } = createClient();
    const engineLabel = engine === "openjev" || engine === "local" ? "OpenJEV" : "Hunch";

    // Show initial subtle status on stderr
    process.stderr.write(`\r\x1b[K⚡ ${c.cyan}[${engineLabel} System One]${c.reset} Analyzing prompt intent...`);

    // 1. Eager Hook Classification: Check whether the message warrants a repository search
    const classification = await classifyPromptIntent(client, prompt);

    // If normal conversation, clarification, general question, or web search - clear status and exit silently
    if (!classification.shouldSearch) {
      process.stderr.write(`\r\x1b[K`);
      process.exit(0);
    }

    const cwd = event.cwd || (Array.isArray(event.workspacePaths) && event.workspacePaths[0]) || process.cwd();

    const config: TraversalConfig = {
      rootDir: cwd,
      task: prompt,
      engine,
      dirThreshold: 0.40,
      fileThreshold: 0.45,
      snippetThreshold: 0.45,
      maxFilesToRead: 12,
      maxDepth: 5,
      maxRounds: 6,
      verbose: false,
      onEvent: renderHookStatus,
    };

    const result = await traverseRepository(client, config);

    // If no relevant files were found, clear status and pass through
    if (result.gatheredContext.length === 0) {
      process.stderr.write(`\r\x1b[K`);
      process.exit(0);
    }

    const markdown = formatResultMarkdown(result);

    const engineName = engine === "openjev" || engine === "local" ? "OPENJEV" : "HUNCH";
    const additionalContext = `### PRE-GATHERED REPOSITORY CONTEXT (${engineName} Traversal)\nThe following target files and verified snippets were pre-gathered across the codebase for your task:\n\n${markdown}\n\n**INSTRUCTIONS FOR AGENT**:\nYou are provided with verified file snippets and target files above.\nDO NOT run exploratory repository search commands (avoid find/grep/cat).\nProceed directly to analyzing the provided files and implementing the requested changes.`;

    // Standard Claude Code / Codex UserPromptSubmit output schema
    const output = {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext,
      },
    };

    console.log(JSON.stringify(output));
    process.exit(0);
  } catch (err) {
    // Clear the status line, then surface the error to stderr.
    // The hook still exits 0 so the caller's prompt flow isn't disrupted,
    // but the failure is logged for debugging.
    process.stderr.write(`\r\x1b[K`);
    const message = err instanceof Error ? (err.stack || err.message) : String(err);
    process.stderr.write(`${c.red}[JEV System One]${c.reset} Hook failed: ${message}\n`);
    process.exit(0);
  }
}
