import { noul, choice, score } from "@typesafe-ai/sdk";
import {
  DirectoryChild,
  EntryEvaluation,
  GatheredFileContext,
  CodeSnippet,
  SufficiencyEvaluation,
  SystemOneClient,
} from "./types.js";
import { FileChunk } from "./fs-utils.js";

const BATCH_SIZE = 30;

/**
 * Evaluates direct child entries of a directory in parallel speculative batches.
 */
export async function evaluateDirectoryEntries(
  client: SystemOneClient,
  task: string,
  currentDir: string,
  children: DirectoryChild[]
): Promise<EntryEvaluation[]> {
  if (children.length === 0) return [];

  const results: EntryEvaluation[] = [];

  // Batch entries if more than BATCH_SIZE
  for (let i = 0; i < children.length; i += BATCH_SIZE) {
    const batch = children.slice(i, i + BATCH_SIZE);
    const questions: Record<string, ReturnType<typeof noul>> = {};

    batch.forEach((child, idx) => {
      const qKey = `item_${idx}`;
      if (child.isDirectory) {
        questions[qKey] = noul(
          `Is the directory '${child.relativePath}/' likely to contain code, tests, or configurations relevant to resolving: '${task}'?`
        );
      } else {
        questions[qKey] = noul(
          `Is the file '${child.relativePath}' likely relevant to inspecting, modifying, or referencing to solve: '${task}'?`
        );
      }
    });

    const state = {
      task,
      current_directory: currentDir || "(root)",
      directory_entries: batch.map((c) => ({
        path: c.relativePath,
        type: c.isDirectory ? "directory" : "file",
      })),
    };

    try {
      const response = await client.systemOne({
        state: JSON.stringify(state),
        questions,
      });

      batch.forEach((child, idx) => {
        const qKey = `item_${idx}`;
        const answer = response.answers[qKey];
        const relevance = answer?.type === "noul" ? answer.noul : 0;
        results.push({
          name: child.name,
          relativePath: child.relativePath,
          isDirectory: child.isDirectory,
          relevance,
        });
      });
    } catch (err) {
      console.error(`Warning: Failed evaluating entries in ${currentDir}:`, err);
      // Fallback: assign conservative relevance
      for (const child of batch) {
        results.push({
          name: child.name,
          relativePath: child.relativePath,
          isDirectory: child.isDirectory,
          relevance: 0.2,
        });
      }
    }
  }

  return results;
}

/**
 * Inspects file content, determines role, and extracts relevant snippet chunks.
 */
export async function evaluateFileContent(
  client: SystemOneClient,
  task: string,
  relativePath: string,
  fileData: { fullContent: string; lines: string[]; chunks: FileChunk[] },
  snippetThreshold = 0.45
): Promise<GatheredFileContext> {
  const { lines, chunks } = fileData;

  // If single chunk (small file)
  if (chunks.length <= 1) {
    const singleChunk = chunks[0] || {
      index: 0,
      startLine: 1,
      endLine: lines.length,
      text: lines.map((l, i) => `L${i + 1}: ${l}`).join("\n"),
    };

    const state = {
      task,
      file_path: relativePath,
      total_lines: lines.length,
      file_content: singleChunk.text,
    };

    const response = await client.systemOne({
      state: JSON.stringify(state),
      questions: {
        role: choice(`What role does '${relativePath}' play for the task: '${task}'?`, {
          modify: "Code in this file must be modified, edited, or patched to solve the task",
          reference: "This file is needed as a reference, type definition, caller, or context",
          irrelevant: "This file is not needed to solve this task",
        }),
        relevance: noul(
          `Does the content of '${relativePath}' contain code, types, or configs needed to solve: '${task}'?`
        ),
      },
    });

    const role = (response.answers.role?.choice as "modify" | "reference" | "irrelevant") || "reference";
    const relevance = response.answers.relevance?.noul ?? 0.5;
    const confidence = response.answers.role?.confidence ?? 0.5;

    const snippets: CodeSnippet[] = [];
    if (role !== "irrelevant" && relevance >= 0.35) {
      snippets.push({
        startLine: 1,
        endLine: lines.length,
        content: fileData.fullContent,
        relevance,
      });
    }

    return {
      relativePath,
      role,
      relevance,
      confidence,
      snippets,
      fullFileIncluded: true,
    };
  }

  // Multi-chunk file: limit chunks to at most 12 most relevant to avoid huge state
  const chunksToEvaluate = chunks.slice(0, 12);

  const state = {
    task,
    file_path: relativePath,
    total_lines: lines.length,
    chunks: chunksToEvaluate.map((c) => ({
      chunk_id: c.index,
      lines: `${c.startLine}-${c.endLine}`,
      content: c.text,
    })),
  };

  const chunkQuestions: Record<string, ReturnType<typeof noul>> = {};
  chunksToEvaluate.forEach((c) => {
    chunkQuestions[`chunk_${c.index}`] = noul(
      `Do lines ${c.startLine}-${c.endLine} of '${relativePath}' contain logic, functions, or types that need modification or close reference for: '${task}'?`
    );
  });

  const response = await client.systemOne({
    state: JSON.stringify(state),
    questions: {
      role: choice(`What role does '${relativePath}' play for the task: '${task}'?`, {
        modify: "Code in this file must be modified or patched to solve the task",
        reference: "This file is needed as a reference, type definition, or configuration",
        irrelevant: "This file is not needed to solve this task",
      }),
      relevance: noul(
        `Does '${relativePath}' contain code, types, or configs directly needed for: '${task}'?`
      ),
      ...chunkQuestions,
    },
  });

  const role = (response.answers.role?.choice as "modify" | "reference" | "irrelevant") || "reference";
  const relevance = response.answers.relevance?.noul ?? 0.5;
  const confidence = response.answers.role?.confidence ?? 0.5;

  const scoredChunks: { chunk: FileChunk; score: number }[] = [];
  const answersMap = response.answers as Record<string, any>;
  chunksToEvaluate.forEach((c) => {
    const qKey = `chunk_${c.index}`;
    const ans = answersMap[qKey];
    const scoreVal = ans?.type === "noul" ? ans.noul : 0;
    scoredChunks.push({ chunk: c, score: scoreVal });
  });

  // Filter chunks meeting snippetThreshold or top 2 chunks if relevance is high
  let selected = scoredChunks.filter((sc) => sc.score >= snippetThreshold);
  if (selected.length === 0 && role !== "irrelevant" && relevance >= 0.5) {
    scoredChunks.sort((a, b) => b.score - a.score);
    if (scoredChunks[0]) selected.push(scoredChunks[0]);
  }

  // Sort selected chunks by line start
  selected.sort((a, b) => a.chunk.startLine - b.chunk.startLine);

  // Merge contiguous / overlapping chunks
  const mergedSnippets: CodeSnippet[] = [];
  for (const item of selected) {
    const last = mergedSnippets[mergedSnippets.length - 1];
    if (last && item.chunk.startLine <= last.endLine + 3) {
      // Merge
      const combinedEndLine = Math.max(last.endLine, item.chunk.endLine);
      const combinedLines = lines.slice(last.startLine - 1, combinedEndLine);
      last.endLine = combinedEndLine;
      last.content = combinedLines.map((l, i) => `L${last.startLine + i}: ${l}`).join("\n");
      last.relevance = Math.max(last.relevance, item.score);
    } else {
      const chunkLines = lines.slice(item.chunk.startLine - 1, item.chunk.endLine);
      mergedSnippets.push({
        startLine: item.chunk.startLine,
        endLine: item.chunk.endLine,
        content: chunkLines.map((l, i) => `L${item.chunk.startLine + i}: ${l}`).join("\n"),
        relevance: item.score,
      });
    }
  }

  return {
    relativePath,
    role,
    relevance,
    confidence,
    snippets: mergedSnippets,
    fullFileIncluded: false,
  };
}

/**
 * Evaluates whether the currently gathered context is sufficient to solve the task.
 */
export async function evaluateContextSufficiency(
  client: SystemOneClient,
  task: string,
  gatheredContext: GatheredFileContext[]
): Promise<SufficiencyEvaluation> {
  if (gatheredContext.length === 0) {
    return {
      isSufficient: false,
      sufficiencyProbability: 0,
      readinessScore: 0,
      readinessLegend: "No files gathered yet",
      nextAction: "continue_missing_impl",
    };
  }

  const contextSummary = gatheredContext.map((item) => ({
    file: item.relativePath,
    role: item.role,
    relevance: item.relevance,
    snippets_count: item.snippets.length,
    covered_lines: item.snippets.map((s) => `${s.startLine}-${s.endLine}`).join(", "),
  }));

  const state = {
    task,
    files_gathered_count: gatheredContext.length,
    gathered_context: contextSummary,
  };

  const response = await client.systemOne({
    state: JSON.stringify(state),
    questions: {
      is_sufficient: noul(
        `Is the gathered context sufficient and complete for an autonomous coding agent to understand, locate, and fix/implement: '${task}' without searching for additional unknown files?`
      ),
      readiness: score(
        `Rate how ready a coding agent would be to solve this task using only the gathered context:`,
        [
          "Incomplete: missing core implementation files or target problem area",
          "Partially complete: has some relevant files but missing key dependencies or definitions",
          "Sufficient: has the target files to modify and necessary references to execute the task",
          "Comprehensive: has all affected files, types, and exact modification points",
        ] as const
      ),
      next_action: choice(`What should the repository traverser do next?`, {
        stop_sufficient: "Stop traversal: the context is sufficient to solve the task",
        continue_missing_impl: "Continue searching: core implementation files are still missing",
        continue_missing_refs: "Continue searching: needed type definitions, callers, or configurations are missing",
      }),
    },
  });

  const sufficiencyProbability = response.answers.is_sufficient?.noul ?? 0;
  const readinessScore = response.answers.readiness?.score ?? 0;
  const nextAction = (response.answers.next_action?.choice as
    | "stop_sufficient"
    | "continue_missing_impl"
    | "continue_missing_refs") || "continue_missing_refs";

  const isSufficient = sufficiencyProbability >= 0.65 || nextAction === "stop_sufficient" || readinessScore >= 2.0;

  const legendMap: Record<number, string> = {
    0: "Incomplete",
    1: "Partially complete",
    2: "Sufficient",
    3: "Comprehensive",
  };
  const roundedScore = Math.min(3, Math.max(0, Math.round(readinessScore)));
  const readinessLegend = legendMap[roundedScore] || "In progress";

  return {
    isSufficient,
    sufficiencyProbability,
    readinessScore,
    readinessLegend,
    nextAction,
  };
}
