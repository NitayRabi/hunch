import { createClient } from "./client.js";
import { traverseRepository } from "./traverser.js";
import { formatResultMarkdown } from "./formatter.js";
import { TraversalConfig } from "./types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

export async function runHook(): Promise<void> {
  try {
    const raw = await readStdin();
    if (!raw) {
      process.exit(0);
    }

    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      // Non-JSON input: ignore and exit clean
      process.exit(0);
    }

    // Extract prompt from various dialect schemas (Codex, Claude Code, AGY)
    let prompt = "";
    if (typeof event.prompt === "string") {
      prompt = event.prompt;
    } else if (typeof event.userPrompt === "string") {
      prompt = event.userPrompt;
    } else if (Array.isArray(event.messages) && event.messages.length > 0) {
      const last = event.messages[event.messages.length - 1];
      if (typeof last.content === "string") {
        prompt = last.content;
      } else if (Array.isArray(last.content)) {
        prompt = last.content.map((c: any) => c.text || "").join(" ");
      }
    }

    prompt = prompt.trim();
    if (!prompt || prompt.startsWith("/") || prompt.length < 5) {
      // Empty or slash command (e.g. /compact, /exit): pass through without context
      process.exit(0);
    }

    const cwd = event.cwd || (Array.isArray(event.workspacePaths) && event.workspacePaths[0]) || process.cwd();

    const client = createClient();
    const config: TraversalConfig = {
      rootDir: cwd,
      task: prompt,
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

    const additionalContext = `### PRE-GATHERED REPOSITORY CONTEXT (TypeSafe JEV Traversal)
The following target files and verified snippets were pre-gathered across the codebase for your task:

${markdown}

**INSTRUCTIONS FOR AGENT**:
You are provided with verified file snippets and target files above.
DO NOT run exploratory repository search commands (avoid find/grep/cat).
Proceed directly to analyzing the provided files and implementing the requested changes.`;

    // Standard Claude Code / Codex UserPromptSubmit output schema
    const output = {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext,
      },
    };

    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (err) {
    // Fail-safe: hooks must never crash or block the user prompt
    console.error("JEV Hook Error:", err);
    process.exit(0);
  }
}
