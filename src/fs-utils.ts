import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DirectoryChild } from "./types.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".github",
  "node_modules",
  "dist",
  "build",
  "target",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".idea",
  ".vscode",
  ".storybook",
  ".worktrees",
  ".antigravitycli",
  ".impeccable",
  ".sentrux",
  ".wabi",
  ".agents",
  ".claude",
  ".codex",
  "playwright-report",
  "test-results",
  "__pycache__",
]);

const IGNORED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".svg",
  ".webp",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".wasm",
  ".pyc",
  ".exe",
  ".so",
  ".dylib",
  ".bin",
  ".mp4",
  ".mp3",
  ".wav",
  ".map",
]);

const IGNORED_FILENAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.lock",
  "skills-lock.json",
  "tsconfig.tsbuildinfo",
  ".DS_Store",
]);

export function shouldIgnoreDirectory(dirName: string): boolean {
  return dirName.startsWith(".git") || IGNORED_DIRECTORIES.has(dirName);
}

export function shouldIgnoreFile(fileName: string): boolean {
  if (IGNORED_FILENAMES.has(fileName)) return true;
  const ext = path.extname(fileName).toLowerCase();
  return IGNORED_EXTENSIONS.has(ext);
}

export async function readDirectoryChildren(
  rootDir: string,
  relativeDir: string
): Promise<DirectoryChild[]> {
  const fullDirPath = path.join(rootDir, relativeDir);
  try {
    const dirEntries = await fs.readdir(fullDirPath, { withFileTypes: true });
    const children: DirectoryChild[] = [];

    for (const entry of dirEntries) {
      const entryName = entry.name;
      const childRelativePath = relativeDir ? path.join(relativeDir, entryName) : entryName;

      if (entry.isDirectory()) {
        if (!shouldIgnoreDirectory(entryName)) {
          children.push({
            name: entryName,
            relativePath: childRelativePath,
            isDirectory: true,
          });
        }
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        if (!shouldIgnoreFile(entryName)) {
          try {
            const stat = await fs.stat(path.join(fullDirPath, entryName));
            // Skip files larger than 1.5MB to avoid binary/minified bloat
            if (stat.size <= 1.5 * 1024 * 1024) {
              children.push({
                name: entryName,
                relativePath: childRelativePath,
                isDirectory: false,
                sizeBytes: stat.size,
              });
            }
          } catch {
            // Stat error, skip
          }
        }
      }
    }

    return children;
  } catch {
    return [];
  }
}

export interface FileChunk {
  index: number;
  startLine: number;
  endLine: number;
  text: string;
}

export async function readFileWithChunks(
  rootDir: string,
  relativePath: string
): Promise<{ fullContent: string; lines: string[]; chunks: FileChunk[] } | null> {
  const fullPath = path.join(rootDir, relativePath);
  try {
    const rawContent = await fs.readFile(fullPath, "utf-8");
    // Check if file seems binary
    if (rawContent.includes("\0")) {
      return null;
    }

    const lines = rawContent.split(/\r?\n/);
    const chunks: FileChunk[] = [];

    // If small file, 1 single chunk
    if (lines.length <= 60) {
      chunks.push({
        index: 0,
        startLine: 1,
        endLine: lines.length,
        text: lines.map((l: string, i: number) => `L${i + 1}: ${l}`).join("\n"),
      });
    } else {
      // Chunk into ~40 lines with 8 lines overlap
      const CHUNK_SIZE = 40;
      const OVERLAP = 8;
      const STEP = CHUNK_SIZE - OVERLAP;

      let chunkIdx = 0;
      for (let i = 0; i < lines.length; i += STEP) {
        const start = i;
        const end = Math.min(lines.length, i + CHUNK_SIZE);
        const slice = lines.slice(start, end);

        chunks.push({
          index: chunkIdx++,
          startLine: start + 1,
          endLine: end,
          text: slice.map((l: string, idx: number) => `L${start + idx + 1}: ${l}`).join("\n"),
        });

        if (end >= lines.length) break;
      }
    }

    return {
      fullContent: rawContent,
      lines,
      chunks,
    };
  } catch {
    return null;
  }
}
