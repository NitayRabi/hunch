import {
  TraversalConfig,
  TraversalResult,
  GatheredFileContext,
  SufficiencyEvaluation,
  EntryEvaluation,
  SystemOneClient,
} from "./types.js";
import { readDirectoryChildren, readFileWithChunks } from "./fs-utils.js";
import {
  evaluateDirectoryEntries,
  evaluateFileContent,
  evaluateContextSufficiency,
} from "./evaluator.js";

interface DirectoryFrontierNode {
  dir: string;
  depth: number;
  logProbSum: number;
  score: number;
}

interface FileCandidateNode {
  relativePath: string;
  relevance: number;
  isCodeFile: boolean;
  priority: number;
}

function isSourceCodeFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return Boolean(
    ext &&
      ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "java", "c", "cpp", "cs", "rb", "php", "swift", "kt", "sql"].includes(ext)
  );
}

export async function traverseRepository(
  client: SystemOneClient,
  config: TraversalConfig
): Promise<TraversalResult> {
  const startTime = Date.now();
  let totalApiRequests = 0;

  const visitedDirs = new Set<string>();
  const inspectedFiles = new Set<string>();
  const gatheredContextMap = new Map<string, GatheredFileContext>();

  const dirFrontier: DirectoryFrontierNode[] = [
    { dir: "", depth: 0, logProbSum: 0, score: 1.0 },
  ];
  const fileCandidates: FileCandidateNode[] = [];

  let lastSufficiency: SufficiencyEvaluation = {
    isSufficient: false,
    sufficiencyProbability: 0,
    readinessScore: 0,
    readinessLegend: "Not started",
    nextAction: "continue_missing_impl",
  };

  config.onEvent?.({
    type: "start",
    task: config.task,
    rootDir: config.rootDir,
    engine: config.engine,
  });

  if (config.verbose) {
    console.log(`[Traverser] Engine: ${config.engine?.toUpperCase() || "JEV"}`);
    console.log(`[Traverser] Starting traversal from: ${config.rootDir}`);
    console.log(`[Traverser] Task: "${config.task}"`);
  }

  for (let round = 0; round < config.maxRounds; round++) {
    if (config.verbose) {
      console.log(`\n[Round ${round + 1}/${config.maxRounds}] Dirs in frontier: ${dirFrontier.length}, File candidates: ${fileCandidates.length}`);
    }

    // 1. Pop top candidate directories from frontier
    dirFrontier.sort((a, b) => b.score - a.score);
    const dirsToExplore: DirectoryFrontierNode[] = [];
    while (dirFrontier.length > 0 && dirsToExplore.length < 3) {
      const node = dirFrontier.shift()!;
      if (!visitedDirs.has(node.dir)) {
        visitedDirs.add(node.dir);
        dirsToExplore.push(node);
      }
    }

    // Explore each directory
    for (const dirNode of dirsToExplore) {
      if (dirNode.depth >= config.maxDepth) continue;

      config.onEvent?.({
        type: "dir_exploring",
        dir: dirNode.dir,
        depth: dirNode.depth,
        score: dirNode.score,
        round: round + 1,
      });

      if (config.verbose) {
        console.log(`  -> Exploring directory: "${dirNode.dir || "."}" (depth: ${dirNode.depth}, score: ${dirNode.score.toFixed(2)})`);
      }

      const children = await readDirectoryChildren(config.rootDir, dirNode.dir);
      if (children.length === 0) continue;

      const evaluations: EntryEvaluation[] = await evaluateDirectoryEntries(
        client,
        config.task,
        dirNode.dir,
        children
      );
      totalApiRequests++;

      const highRelevanceEntries: EntryEvaluation[] = [];

      for (const item of evaluations) {
        if (config.verbose && item.relevance >= 0.4) {
          console.log(`     - [p=${item.relevance.toFixed(2)}] ${item.relativePath}${item.isDirectory ? "/" : ""}`);
        }

        if (item.isDirectory) {
          if (item.relevance >= config.dirThreshold) {
            highRelevanceEntries.push(item);
            // Compute decay-adjusted branch score
            const branchScore = item.relevance * Math.pow(0.92, dirNode.depth + 1);
            dirFrontier.push({
              dir: item.relativePath,
              depth: dirNode.depth + 1,
              logProbSum: dirNode.logProbSum + Math.log(Math.max(item.relevance, 0.05)),
              score: branchScore,
            });
          }
        } else {
          // File evaluation
          if (item.relevance >= config.fileThreshold) {
            highRelevanceEntries.push(item);
            const isCode = isSourceCodeFile(item.relativePath);
            const priority = item.relevance * (isCode ? 1.25 : 0.8);
            fileCandidates.push({
              relativePath: item.relativePath,
              relevance: item.relevance,
              isCodeFile: isCode,
              priority,
            });
          }
        }
      }

      config.onEvent?.({
        type: "entries_evaluated",
        dir: dirNode.dir,
        totalEntries: children.length,
        highRelevanceEntries,
      });
    }

    // 2. Inspect top candidate files
    fileCandidates.sort((a, b) => b.priority - a.priority);
    const filesToInspect: FileCandidateNode[] = [];
    while (
      fileCandidates.length > 0 &&
      filesToInspect.length < 4 &&
      inspectedFiles.size < config.maxFilesToRead
    ) {
      const cand = fileCandidates.shift()!;
      if (!inspectedFiles.has(cand.relativePath)) {
        inspectedFiles.add(cand.relativePath);
        filesToInspect.push(cand);
      }
    }

    for (const fileNode of filesToInspect) {
      config.onEvent?.({
        type: "file_inspecting",
        relativePath: fileNode.relativePath,
        priority: fileNode.priority,
      });

      if (config.verbose) {
        console.log(`  -> Reading file content: "${fileNode.relativePath}"`);
      }

      const fileData = await readFileWithChunks(config.rootDir, fileNode.relativePath);
      if (!fileData) continue;

      const fileContext = await evaluateFileContent(
        client,
        config.task,
        fileNode.relativePath,
        fileData,
        config.snippetThreshold
      );
      totalApiRequests++;

      const linesCount = fileContext.snippets.reduce(
        (acc, s) => acc + (s.endLine - s.startLine + 1),
        0
      );

      config.onEvent?.({
        type: "file_inspected",
        relativePath: fileContext.relativePath,
        relevance: fileContext.relevance,
        role: fileContext.role,
        linesCount,
      });

      if (config.verbose) {
        console.log(`     Role: ${fileContext.role.toUpperCase()} (rel=${fileContext.relevance.toFixed(2)}, conf=${fileContext.confidence.toFixed(2)}), snippets: ${fileContext.snippets.length}`);
      }

      if (fileContext.role !== "irrelevant" && fileContext.relevance >= 0.35) {
        gatheredContextMap.set(fileContext.relativePath, fileContext);
      }
    }

    // 3. Sufficiency check if we have gathered files
    if (gatheredContextMap.size > 0) {
      config.onEvent?.({
        type: "sufficiency_checking",
        round: round + 1,
        maxRounds: config.maxRounds,
      });

      const currentContext = Array.from(gatheredContextMap.values());
      lastSufficiency = await evaluateContextSufficiency(
        client,
        config.task,
        currentContext
      );
      totalApiRequests++;

      config.onEvent?.({
        type: "sufficiency_result",
        isSufficient: lastSufficiency.isSufficient,
        pSufficient: lastSufficiency.sufficiencyProbability,
        action: lastSufficiency.nextAction,
        readiness: `${lastSufficiency.readinessScore.toFixed(1)}/3.0 (${lastSufficiency.readinessLegend})`,
      });

      if (config.verbose) {
        console.log(`  -> Sufficiency Check: p=${lastSufficiency.sufficiencyProbability.toFixed(2)}, score=${lastSufficiency.readinessScore.toFixed(1)} (${lastSufficiency.readinessLegend}), action=${lastSufficiency.nextAction}`);
      }

      if (lastSufficiency.isSufficient) {
        if (config.verbose) {
          console.log(`[Traverser] Context sufficiency threshold reached! Stopping traversal.`);
        }
        break;
      }
    }

    // Termination conditions
    if (inspectedFiles.size >= config.maxFilesToRead) {
      if (config.verbose) console.log(`[Traverser] Reached max files limit (${config.maxFilesToRead}).`);
      break;
    }

    if (dirFrontier.length === 0 && fileCandidates.length === 0) {
      if (config.verbose) console.log(`[Traverser] Frontier exhausted. Finished exploration.`);
      break;
    }
  }

  // Sort gathered context: "modify" first, then highest relevance
  const sortedContext = Array.from(gatheredContextMap.values()).sort((a, b) => {
    if (a.role === "modify" && b.role !== "modify") return -1;
    if (b.role === "modify" && a.role !== "modify") return 1;
    return b.relevance - a.relevance;
  });

  const durationMs = Date.now() - startTime;
  const targetFilesCount = sortedContext.filter((c) => c.role === "modify").length;
  const referenceFilesCount = sortedContext.filter((c) => c.role === "reference").length;
  const totalLinesGathered = sortedContext.reduce(
    (acc, f) => acc + f.snippets.reduce((sAcc, s) => sAcc + (s.endLine - s.startLine + 1), 0),
    0
  );

  config.onEvent?.({
    type: "finished",
    durationMs,
    totalCalls: totalApiRequests,
    dirsTraversed: visitedDirs.size,
    targetFilesCount,
    referenceFilesCount,
    totalLinesGathered,
    engine: config.engine,
  });

  return {
    task: config.task,
    rootDir: config.rootDir,
    engine: config.engine,
    durationMs,
    totalApiRequests,
    directoriesVisited: Array.from(visitedDirs),
    filesInspected: Array.from(inspectedFiles),
    gatheredContext: sortedContext,
    sufficiency: lastSufficiency,
  };
}
