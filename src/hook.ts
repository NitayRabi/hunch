#!/usr/bin/env node
import * as readline from "node:readline";
import { createClient } from "./client.js";
import { traverseRepository } from "./traverser.js";
import { formatResultMarkdown } from "./formatter.js";
import { TraversalConfig } from "./types.js";

/**
 * Hook mode: Reads a JSON payload from stdin (e.g. from Claude Code / Codex UserPromptSubmit hook),
 * runs speculative Hunch context traversal against the workspace, and outputs additionalContext.
 */
export async function runHook() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  let inputData = "";
  for await (const line of rl) {
    inputData += line + "\n";
  }

  if (!inputData.trim()) {
    process.exit(0);
  }

  try {
    const event = JSON.parse(inputData);
    const prompt = event.prompt || event.message || event.task || "";
    if (!prompt.trim()) {
      process.exit(0);
    }

    // Skip short prompts / greetings
    if (prompt.length < 15 || prompt.split(" ").length < 3) {
      process.exit(0);
    }

    const cwd = event.cwd || (Array.isArray(event.workspacePaths) && event.workspacePaths[0]) || process.cwd();

    const { client, engine } = createClient();
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
    };

    const result = await traverseRepository(client, config);

    // If no relevant files were found, pass through
    if (result.gatheredContext.length === 0) {
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
    // Fail silently in hook mode so we never block normal agent execution
    process.exit(0);
  }
}
