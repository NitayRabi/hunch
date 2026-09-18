/**
 * Rich CLI UI & Streaming utilities for JEV Researcher and Codex.
 */

export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bgCyan: "\x1b[46m",
  bgBlack: "\x1b[40m",
};

export function banner(title: string, subtitle?: string): void {
  const width = 64;
  const line = "─".repeat(width);
  console.log(`\n${c.cyan}╭${line}╮${c.reset}`);
  console.log(`${c.cyan}│${c.reset} ${c.bold}${c.white}${title.padEnd(width - 2)}${c.reset} ${c.cyan}│${c.reset}`);
  if (subtitle) {
    console.log(`${c.cyan}│${c.reset} ${c.dim}${subtitle.padEnd(width - 2)}${c.reset} ${c.cyan}│${c.reset}`);
  }
  console.log(`${c.cyan}╰${line}╯${c.reset}\n`);
}

export function section(title: string): void {
  console.log(`\n${c.bold}${c.magenta}=== ${title} ===${c.reset}`);
}

export function badge(label: string, color: "green" | "yellow" | "red" | "cyan" | "gray"): string {
  const col = c[color] || c.white;
  return `${col}[${label}]${c.reset}`;
}

export function formatPct(val: number): string {
  const pct = Math.round(val * 100);
  if (pct >= 80) return `${c.green}${pct}%${c.reset}`;
  if (pct >= 50) return `${c.yellow}${pct}%${c.reset}`;
  return `${c.gray}${pct}%${c.reset}`;
}

export function renderJevEvent(event: any): void {
  const engineLabel = event.engine === "openjev" ? "OpenJEV" : "JEV";
  switch (event.type) {
    case "start":
      console.log(`${c.cyan}⚡ [${engineLabel} System One]${c.reset} Initializing parallel tree traversal...`);
      console.log(`   ${c.dim}Task:${c.reset} ${c.bold}${event.task}${c.reset}`);
      console.log(`   ${c.dim}Engine:${c.reset} ${c.green}${engineLabel}${c.reset}`);
      console.log(`   ${c.dim}Root:${c.reset} ${event.rootDir}\n`);
      break;

    case "dir_exploring":
      console.log(
        `${c.cyan}📂 [Round ${event.round}]${c.reset} Exploring ${c.bold}"${event.dir || "."}"${c.reset} ` +
        `${c.dim}(depth: ${event.depth}, score: ${event.score.toFixed(2)})${c.reset}`
      );
      break;

    case "entries_evaluated":
      if (event.highRelevanceEntries?.length > 0) {
        for (const entry of event.highRelevanceEntries) {
          const icon = entry.isDirectory ? "📁" : "📄";
          const suffix = entry.isDirectory ? "/" : "";
          const badgeColor = entry.relevance >= 0.8 ? "green" : "yellow";
          console.log(
            `   ${badge(`${Math.round(entry.relevance * 100)}%`, badgeColor)} ${icon} ${entry.relativePath}${suffix}`
          );
        }
      } else {
        console.log(`   ${c.dim}↳ Evaluated ${event.totalEntries} entries (no high-confidence hits)${c.reset}`);
      }
      break;

    case "file_inspecting":
      console.log(`   ${c.yellow}🔍 Inspecting code candidate:${c.reset} ${event.relativePath}`);
      break;

    case "file_inspected":
      const roleBadge = event.role === "modify" 
        ? `${c.green}[TARGET: MODIFY]${c.reset}` 
        : `${c.cyan}[REFERENCE]${c.reset}`;
      console.log(
        `   ${c.green}✓ Confirmed:${c.reset} ${event.relativePath} ${roleBadge} ` +
        `(${event.linesCount} lines, relevance: ${formatPct(event.relevance)})`
      );
      break;

    case "sufficiency_checking":
      process.stdout.write(`   ${c.dim}⚖️  Evaluating context sufficiency (${event.round}/${event.maxRounds})...${c.reset} `);
      break;

    case "sufficiency_result":
      if (event.isSufficient) {
        console.log(
          `\r   ${c.bold}${c.green}✨ Context Sufficiency Reached!${c.reset} ` +
          `${c.dim}(readiness: ${event.readiness})${c.reset}`
        );
        console.log(`   ${c.green}⏹️  Early termination triggered — pre-gathered context is complete.${c.reset}`);
      } else {
        console.log(
          `\r   ${c.dim}⚖️  Context readiness: ${event.readiness} (continuing traversal...)${c.reset}`
        );
      }
      break;

    case "finished":
      const title = ` ${engineLabel} Traversal Complete `;
      const fillLen = Math.max(0, 54 - title.length);
      const leftPad = "─".repeat(Math.floor(fillLen / 2));
      const rightPad = "─".repeat(Math.ceil(fillLen / 2));
      console.log(`\n${c.green}╭${leftPad}${title}${rightPad}╮${c.reset}`);
      console.log(`${c.green}│${c.reset}  Engine:            ${c.bold}${engineLabel}${c.reset}`.padEnd(65) + `${c.green}│${c.reset}`);
      console.log(`${c.green}│${c.reset}  Duration:          ${c.bold}${(event.durationMs / 1000).toFixed(2)}s${c.reset}`.padEnd(65) + `${c.green}│${c.reset}`);
      console.log(`${c.green}│${c.reset}  API Requests:      ${c.bold}${event.totalCalls}${c.reset} parallel evaluations`.padEnd(65) + `${c.green}│${c.reset}`);
      console.log(`${c.green}│${c.reset}  Directories:       ${c.bold}${event.dirsTraversed}${c.reset} explored`.padEnd(65) + `${c.green}│${c.reset}`);
      console.log(`${c.green}│${c.reset}  Target Files:      ${c.bold}${event.targetFilesCount}${c.reset} to modify, ${event.referenceFilesCount} reference`.padEnd(65) + `${c.green}│${c.reset}`);
      console.log(`${c.green}│${c.reset}  Context Size:      ${c.bold}${event.totalLinesGathered}${c.reset} lines gathered`.padEnd(65) + `${c.green}│${c.reset}`);
      console.log(`${c.green}╰──────────────────────────────────────────────────────╯${c.reset}\n`);
      break;
  }
}

export function renderCodexStart(profile: string, model: string): void {
  console.log(`\n${c.cyan}╭──────────────── Codex Agent Hand-off ────────────────╮${c.reset}`);
  console.log(`${c.cyan}│${c.reset}  Profile:           ${c.bold}${profile}${c.reset}`.padEnd(65) + `${c.cyan}│${c.reset}`);
  console.log(`${c.cyan}│${c.reset}  Model:             ${c.bold}${model}${c.reset}`.padEnd(65) + `${c.cyan}│${c.reset}`);
  console.log(`${c.cyan}│${c.reset}  Mode:              ${c.green}Guided (Direct synthesis, no search)${c.reset}`.padEnd(65) + `${c.cyan}│${c.reset}`);
  console.log(`${c.cyan}╰──────────────────────────────────────────────────────╯${c.reset}\n`);
}

export function renderCodexSummary(
  codexDurationMs: number,
  traversalDurationMs: number,
  inputTokens: number,
  outputTokens: number,
  toolCallsCount: number
): void {
  const totalTime = ((codexDurationMs + traversalDurationMs) / 1000).toFixed(2);
  console.log(`\n${c.magenta}╭──────────────── Codex Execution Summary ─────────────╮${c.reset}`);
  console.log(`${c.magenta}│${c.reset}  Synthesis Time:    ${c.bold}${(codexDurationMs / 1000).toFixed(2)}s${c.reset}`.padEnd(65) + `${c.magenta}│${c.reset}`);
  console.log(`${c.magenta}│${c.reset}  Total Wall Time:   ${c.bold}${totalTime}s${c.reset} (Traversal + Synthesis)`.padEnd(65) + `${c.magenta}│${c.reset}`);
  console.log(`${c.magenta}│${c.reset}  Input Tokens:      ${c.bold}${inputTokens.toLocaleString()}${c.reset}`.padEnd(65) + `${c.magenta}│${c.reset}`);
  console.log(`${c.magenta}│${c.reset}  Output Tokens:     ${c.bold}${outputTokens.toLocaleString()}${c.reset}`.padEnd(65) + `${c.magenta}│${c.reset}`);
  console.log(`${c.magenta}│${c.reset}  Search Tool Calls: ${c.bold}${toolCallsCount}${c.reset} (Zero grep/find overhead)`.padEnd(65) + `${c.magenta}│${c.reset}`);
  console.log(`${c.magenta}╰──────────────────────────────────────────────────────╯${c.reset}\n`);
}
