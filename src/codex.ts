import { spawn } from "node:child_process";

export interface CodexRunResult {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  finalMessage: string;
  toolCallsCount: number;
  toolCalls: string[];
  rawOutput: string;
  exitCode: number;
}

export interface CodexOptions {
  profile?: string;
  disableShell?: boolean;
  timeoutMs?: number;
}

export function runCodex(
  prompt: string,
  targetDir: string,
  options: CodexOptions = {}
): Promise<CodexRunResult> {
  const { profile = "local", disableShell = false, timeoutMs = 600000 } = options;

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let finalMessage = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCallsCount = 0;
    const toolCalls: string[] = [];
    let rawOutput = "";

    const args = ["exec", "-p", profile, "--json"];
    if (disableShell) {
      args.push("--disable", "shell_tool");
    }
    args.push("-C", targetDir, prompt);

    const child = spawn("codex", args, {
      cwd: targetDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      console.warn(`\n[Codex Warning] Process timed out after ${timeoutMs}ms. Returning accumulated metrics.`);
      resolve({
        finalMessage: finalMessage || "[Codex timed out during autonomous exploration]",
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        toolCallsCount,
        toolCalls,
        durationMs: Date.now() - startTime,
        exitCode: 124,
        rawOutput,
      });
    }, timeoutMs);

    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      rawOutput += text;

      const lines = text.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "item.completed") {
            const item = event.item;
            if (item?.type === "agent_message" && item.text) {
              finalMessage += item.text;
              console.log(`     [Codex Message] ${item.text.slice(0, 140).replace(/\n/g, " ")}...`);
            } else if (item?.type === "command_execution" || item?.type === "tool_call") {
              toolCallsCount++;
              const cmd = item.command || item.name || "tool_call";
              toolCalls.push(cmd);
              console.log(`     [Codex Tool Call #${toolCallsCount}] ${cmd.slice(0, 100)}`);
            }
          } else if (event.type === "turn.completed" && event.usage) {
            inputTokens += event.usage.input_tokens || 0;
            outputTokens += event.usage.output_tokens || 0;
            console.log(`     [Codex Turn Finished] Turn tokens: in=${event.usage.input_tokens}, out=${event.usage.output_tokens}`);
          }
        } catch {
          // Non-JSON line or partial line, ignore
        }
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      rawOutput += data.toString("utf-8");
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      resolve({
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs,
        finalMessage,
        toolCallsCount,
        toolCalls,
        rawOutput,
        exitCode: code ?? 0,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
