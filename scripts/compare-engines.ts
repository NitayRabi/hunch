import * as path from "node:path";
import * as fs from "node:fs/promises";
import { createClient } from "../src/client.js";
import { traverseRepository } from "../src/traverser.js";
import { formatResultMarkdown } from "../src/formatter.js";
import { TraversalConfig, TraversalResult, EngineType } from "../src/types.js";

interface EngineRunResult {
  engine: EngineType;
  traversal: TraversalResult;
  traversalDurationMs: number;
  markdownContext: string;
  targetFiles: string[];
  referenceFiles: string[];
  totalSnippets: number;
  totalLines: number;
}

async function runEngineOnTask(
  engine: EngineType,
  task: string,
  repoDir: string
): Promise<EngineRunResult> {
  console.log(`\n-------------------------------------------------------------`);
  console.log(`RUNNING ENGINE: ${engine.toUpperCase()}`);
  console.log(`TASK: "${task}"`);
  console.log(`-------------------------------------------------------------`);

  const { client } = createClient({ engine });
  const config: TraversalConfig = {
    rootDir: repoDir,
    task,
    engine,
    dirThreshold: 0.40,
    fileThreshold: 0.45,
    snippetThreshold: 0.45,
    maxFilesToRead: 16,
    maxDepth: 6,
    maxRounds: 8,
    verbose: true,
  };

  const startTime = Date.now();
  const traversal = await traverseRepository(client, config);
  const traversalDurationMs = Date.now() - startTime;
  const markdownContext = formatResultMarkdown(traversal);

  const targetFiles = traversal.gatheredContext
    .filter((c) => c.role === "modify")
    .map((c) => `${c.relativePath} (p=${(c.relevance * 100).toFixed(0)}%, conf=${(c.confidence * 100).toFixed(0)}%)`);

  const referenceFiles = traversal.gatheredContext
    .filter((c) => c.role === "reference")
    .map((c) => `${c.relativePath} (p=${(c.relevance * 100).toFixed(0)}%)`);

  const totalSnippets = traversal.gatheredContext.reduce((acc, c) => acc + c.snippets.length, 0);
  const totalLines = traversal.gatheredContext.reduce(
    (acc, c) => acc + c.snippets.reduce((sAcc, s) => sAcc + (s.endLine - s.startLine + 1), 0),
    0
  );

  console.log(
    `[${engine.toUpperCase()}] Traversal finished in ${(traversalDurationMs / 1000).toFixed(2)}s | ${traversal.totalApiRequests} requests | ${traversal.gatheredContext.length} files gathered`
  );

  return {
    engine,
    traversal,
    traversalDurationMs,
    markdownContext,
    targetFiles,
    referenceFiles,
    totalSnippets,
    totalLines,
  };
}

async function main() {
  const repoDir = path.resolve("/home/nitayrabi/projects/portfolio-architect");
  const task = "Fix currency exchange rate caching and conversion fallback in fx-service";

  console.log(`=============================================================`);
  console.log(`ENGINE COMPARISON BENCHMARK: Hunch Cloud vs OpenJEV`);
  console.log(`Repository: ${repoDir}`);
  console.log(`Task: ${task}`);
  console.log(`=============================================================`);

  // 1. Run with Hunch (TypeSafe API)
  const hunchResult = await runEngineOnTask("hunch", task, repoDir);

  // 2. Run with OpenJEV (Local fastcontext logit readout)
  const openjevResult = await runEngineOnTask("openjev", task, repoDir);

  const report = `# Engine Comparison Benchmark: Hunch Cloud vs OpenJEV

**Target Repository**: \`portfolio-architect\`  
**Task**: *${task}*  
**Local Inference Model**: \`fastcontext-1.0-4b-sft-q4_k_m\` (via \`http://127.0.0.1:8080/v1\`)  
**TypeSafe API**: \`https://api.typesafe.ai/v1/system-one\`  

---

## 1. Quantitative Performance Comparison

| Metric | Hunch (Cloud API) | OpenJEV (Local Logits Readout) | Comparison / Notes |
|---|---|---|---|
| **Architecture** | Remote TypeSafe System One API | Local Fastcontext SFT + Direct Logits Readout | Zero network latency vs cloud managed |
| **Exploration Time** | **${(hunchResult.traversalDurationMs / 1000).toFixed(2)}s** | **${(openjevResult.traversalDurationMs / 1000).toFixed(2)}s** | OpenJEV is **${(hunchResult.traversalDurationMs / openjevResult.traversalDurationMs).toFixed(1)}x faster** |
| **System One Requests** | ${hunchResult.traversal.totalApiRequests} parallel batches | ${openjevResult.traversal.totalApiRequests} parallel batches | Tree search evaluations |
| **Directories Explored** | ${hunchResult.traversal.directoriesVisited.length} (${hunchResult.traversal.directoriesVisited.slice(0, 3).join(", ") || "."}...) | ${openjevResult.traversal.directoriesVisited.length} (${openjevResult.traversal.directoriesVisited.slice(0, 3).join(", ") || "."}...) | Frontier branch expansion |
| **Files Inspected** | ${hunchResult.traversal.filesInspected.length} files | ${openjevResult.traversal.filesInspected.length} files | Candidate files read & chunked |
| **Target Files Identified** | ${hunchResult.targetFiles.join(", ") || "None"} | ${openjevResult.targetFiles.join(", ") || "None"} | Isolated target problem area |
| **Reference Files** | ${hunchResult.referenceFiles.join(", ") || "None"} | ${openjevResult.referenceFiles.join(", ") || "None"} | Contextual dependencies |
| **Context Snippets** | ${hunchResult.totalSnippets} snippets (${hunchResult.totalLines} lines) | ${openjevResult.totalSnippets} snippets (${openjevResult.totalLines} lines) | Focused context size |
| **Context Sufficiency** | p=${hunchResult.traversal.sufficiency.sufficiencyProbability.toFixed(2)} (${hunchResult.traversal.sufficiency.readinessLegend}) | p=${openjevResult.traversal.sufficiency.sufficiencyProbability.toFixed(2)} (${openjevResult.traversal.sufficiency.readinessLegend}) | Early termination trigger |

---

## 2. Feature Flag Usage & Configuration

You can seamlessly switch between Hunch Cloud and OpenJEV via command line arguments or environment variables:

\`\`\`bash
# 1. Run with Hunch (Cloud API):
hunch "Fix currency exchange rate caching in fx-service" --hunch

# 2. Run with OpenJEV (Local fastcontext-4b model):
hunch "Fix currency exchange rate caching in fx-service" --openjev
# Or shorthand:
hunch "Fix currency exchange rate caching in fx-service" --local

# 3. Via Environment Variable:
export HUNCH_ENGINE=openjev
# or
export USE_OPENJEV=1
\`\`\`

---

## 3. Pre-Gathered Context Packages

### Hunch Cloud Context Package:
\`\`\`markdown
${hunchResult.markdownContext}
\`\`\`

### OpenJEV Context Package:
\`\`\`markdown
${openjevResult.markdownContext}
\`\`\`
`;

  const outputPath = path.resolve("ENGINE_COMPARISON.md");
  await fs.writeFile(outputPath, report, "utf-8");
  console.log(`\n=============================================================`);
  console.log(`Comparison benchmark report saved to: ${outputPath}`);
  console.log(`=============================================================\n`);
}

main().catch(console.error);
