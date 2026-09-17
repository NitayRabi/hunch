export interface DirectoryChild {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  sizeBytes?: number;
}

export interface EntryEvaluation {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  relevance: number; // probability from 0.0 to 1.0
}

export interface CodeSnippet {
  startLine: number;
  endLine: number;
  content: string;
  relevance: number;
}

export interface GatheredFileContext {
  relativePath: string;
  role: "modify" | "reference" | "irrelevant";
  relevance: number;
  confidence: number;
  snippets: CodeSnippet[];
  fullFileIncluded?: boolean;
}

export interface SufficiencyEvaluation {
  isSufficient: boolean;
  sufficiencyProbability: number;
  readinessScore: number;
  readinessLegend: string;
  nextAction: "stop_sufficient" | "continue_missing_impl" | "continue_missing_refs";
  reasoning?: string;
}

export type JevTraversalEvent =
  | { type: "start"; task: string; rootDir: string }
  | { type: "dir_exploring"; dir: string; depth: number; score: number; round: number }
  | { type: "entries_evaluated"; dir: string; totalEntries: number; highRelevanceEntries: EntryEvaluation[] }
  | { type: "file_inspecting"; relativePath: string; priority: number }
  | { type: "file_inspected"; relativePath: string; relevance: number; role: string; linesCount: number }
  | { type: "sufficiency_checking"; round: number; maxRounds: number }
  | { type: "sufficiency_result"; isSufficient: boolean; pSufficient: number; action: string; readiness: string }
  | {
      type: "finished";
      durationMs: number;
      totalCalls: number;
      dirsTraversed: number;
      targetFilesCount: number;
      referenceFilesCount: number;
      totalLinesGathered: number;
    };

export interface TraversalConfig {
  rootDir: string;
  task: string;
  dirThreshold: number; // threshold to explore directory (default: 0.40)
  fileThreshold: number; // threshold to read file content (default: 0.45)
  snippetThreshold: number; // threshold to include snippet (default: 0.45)
  maxFilesToRead: number; // maximum files to read in total (default: 15)
  maxDepth: number; // max directory depth (default: 6)
  maxRounds: number; // max exploration waves (default: 8)
  verbose?: boolean;
  onEvent?: (event: JevTraversalEvent) => void;
}

export interface TraversalResult {
  task: string;
  rootDir: string;
  durationMs: number;
  totalApiRequests: number;
  directoriesVisited: string[];
  filesInspected: string[];
  gatheredContext: GatheredFileContext[];
  sufficiency: SufficiencyEvaluation;
}
