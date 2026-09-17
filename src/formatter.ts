import { TraversalResult } from "./types.js";

export function formatResultMarkdown(result: TraversalResult): string {
  const { task, durationMs, totalApiRequests, gatheredContext, sufficiency } = result;

  const modifyFiles = gatheredContext.filter((f) => f.role === "modify");
  const referenceFiles = gatheredContext.filter((f) => f.role === "reference");

  const lines: string[] = [];

  lines.push(`# JEV Repo Context Package`);
  lines.push(`**Task**: ${task}`);
  lines.push(
    `**Sufficiency**: ${sufficiency.isSufficient ? "SUFFICIENT" : "PARTIAL"} (p=${sufficiency.sufficiencyProbability.toFixed(2)}, readiness: ${sufficiency.readinessLegend} [${sufficiency.readinessScore.toFixed(1)}/3.0])`
  );
  lines.push(
    `**Traversed**: ${result.directoriesVisited.length} dirs, ${result.filesInspected.length} files inspected, ${totalApiRequests} JEV calls in ${(durationMs / 1000).toFixed(2)}s\n`
  );

  lines.push(`---\n`);

  // Target files to modify
  lines.push(`## 1. Target Files to Modify (${modifyFiles.length})`);
  if (modifyFiles.length === 0) {
    lines.push(`*No primary modification targets identified.*`);
  } else {
    for (const file of modifyFiles) {
      lines.push(`### \`${file.relativePath}\` (Relevance: ${(file.relevance * 100).toFixed(0)}%, Confidence: ${(file.confidence * 100).toFixed(0)}%)`);
      if (file.snippets.length === 0) {
        lines.push(`*(File marked for modification, inspect whole file)*\n`);
      } else {
        for (const s of file.snippets) {
          lines.push(`#### Lines ${s.startLine}-${s.endLine}`);
          lines.push("```");
          lines.push(s.content);
          lines.push("```\n");
        }
      }
    }
  }

  lines.push(`---\n`);

  // Reference files
  lines.push(`## 2. Reference & Context Files (${referenceFiles.length})`);
  if (referenceFiles.length === 0) {
    lines.push(`*No reference files identified.*`);
  } else {
    for (const file of referenceFiles) {
      lines.push(`### \`${file.relativePath}\` (Relevance: ${(file.relevance * 100).toFixed(0)}%)`);
      if (file.snippets.length === 0) {
        lines.push(`*(Reference file identified)*\n`);
      } else {
        for (const s of file.snippets) {
          lines.push(`#### Lines ${s.startLine}-${s.endLine}`);
          lines.push("```");
          lines.push(s.content);
          lines.push("```\n");
        }
      }
    }
  }

  return lines.join("\n");
}

export function formatResultJson(result: TraversalResult): string {
  return JSON.stringify(result, null, 2);
}
