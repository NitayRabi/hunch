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
  console.log(`ENGINE COMPARISON BENCHMARK: TypeSafe JEV vs OpenJEV`);
  console.log(`Repository: ${repoDir}`);
  console.log(`Task: ${task}`);
  console.log(`=============================================================`);

  // 1. Run with JEV (TypeSafe API)
  const jevResult = await runEngineOnTask("jev", task, repoDir);

  // 2. Run with OpenJEV (Local fastcontext logit readout)
  const openjevResult = await runEngineOnTask("openjev", task, repoDir);

  const report = `# Engine Comparison Benchmark: TypeSafe JEV vs OpenJEV

**Target Repository**: \`portfolio-architect\`  
**Task**: *${task}*  
**Local Inference Model**: \`fastcontext-1.0-4b-sft-q4_k_m\` (via \`http://127.0.0.1:8080/v1\`)  
**TypeSafe API**: \`https://api.typesafe.ai/v1/system-one\`  

---

## 1. Quantitative Performance Comparison

| Metric | TypeSafe JEV (Cloud API) | OpenJEV (Local Logits Readout) | Comparison / Notes |
|---|---|---|---|
| **Architecture** | Remote TypeSafe System One API | Local Fastcontext SFT + Direct Logits Readout | Zero network latency vs cloud managed |
| **Exploration Time** | **${(jevResult.traversalDurationMs / 1000).toFixed(2)}s** | **${(openjevResult.traversalDurationMs / 1000).toFixed(2)}s** | OpenJEV is **${(jevResult.traversalDurationMs / openjevResult.traversalDurationMs).toFixed(1)}x faster** |
| **System One Requests** | ${jevResult.traversal.totalApiRequests} parallel batches | ${openjevResult.traversal.totalApiRequests} parallel batches | Tree search evaluations |
| **Directories Explored** | ${jevResult.traversal.directoriesVisited.length} (${jevResult.traversal.directoriesVisited.slice(0, 3).join(", ") || "."}...) | ${openjevResult.traversal.directoriesVisited.length} (${openjevResult.traversal.directoriesVisited.slice(0, 3).join(", ") || "."}...) | Frontier branch expansion |
| **Files Inspected** | ${jevResult.traversal.filesInspected.length} files | ${openjevResult.traversal.filesInspected.length} files | Candidate files read & chunked |
| **Target Files Identified** | ${jevResult.targetFiles.join(", ") || "None"} | ${openjevResult.targetFiles.join(", ") || "None"} | Isolated target problem area |
| **Reference Files** | ${jevResult.referenceFiles.join(", ") || "None"} | ${openjevResult.referenceFiles.join(", ") || "None"} | Contextual dependencies |
| **Context Snippets** | ${jevResult.totalSnippets} snippets (${jevResult.totalLines} lines) | ${openjevResult.totalSnippets} snippets (${openjevResult.totalLines} lines) | Focused context size |
| **Context Sufficiency** | p=${jevResult.traversal.sufficiency.sufficiencyProbability.toFixed(2)} (${jevResult.traversal.sufficiency.readinessLegend}) | p=${openjevResult.traversal.sufficiency.sufficiencyProbability.toFixed(2)} (${openjevResult.traversal.sufficiency.readinessLegend}) | Early termination trigger |

---

## 2. Feature Flag Usage & Configuration

You can seamlessly switch between JEV and OpenJEV via command line arguments or environment variables:

\`\`\`bash
# 1. Run with JEV (TypeSafe API):
npx tsx src/index.ts "Fix currency exchange rate caching in fx-service" --engine jev

# 2. Run with OpenJEV (Local fastcontext-4b model):
npx tsx src/index.ts "Fix currency exchange rate caching in fx-service" --engine openjev
# Or shorthand:
npx tsx src/index.ts "Fix currency exchange rate caching in fx-service" --openjev

# 3. Via Environment Variable:
export JEV_ENGINE=openjev
# or
export USE_OPENJEV=1
\`\`\`

---

## 3. Pre-Gathered Context Packages

### TypeSafe JEV Context Package:
\`\`\`markdown
${jevResult.markdownContext}
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
