# JEV Researcher

Fast, zero-string-search repository traverser powered by **TypeSafe AI JEV System One**.

Given a codebase and a task prompt, `jev-researcher` traverses directory hierarchies using speculative parallel classification, inspects promising file contents at calibrated thresholds, extracts exact line snippets, and determines whether the gathered context is sufficient for an autonomous coding agent to implement the solution.

## Key Design Principles

1. **No Keyword or String Search**: JEV does not generate prose; instead, it evaluates typed probabilistic primitives (`noul`, `choice`, `score`) directly on structured filesystem state.
2. **Speculative Parallel Fan-Out**: Evaluates sibling directory entries in parallel batches using JEV's sub-second classification (~500ms).
3. **Geometric-Mean Length Normalization**: Deep directories are scored fairly against shallow directories using geometric mean path probabilities (`exp(sum(log(p)) / depth)`).
4. **Code-Aware Prioritization**: Prioritizes source code files for implementation tasks while keeping documentation and configs secondary.
5. **Content Chunking & Role Classification**: Evaluates candidate files into `modify`, `reference`, or `irrelevant`, and extracts relevant line-numbered snippets.
6. **Sufficiency Termination Gate**: Asks JEV after each wave whether the gathered context is sufficient to fix the task, terminating early once complete.

## Installation & Usage

From within this project:
```bash
# Run with task prompt against current repository
npx tsx src/index.ts "Fix currency exchange rate caching in fx-service"

# Target a different repository
npx tsx src/index.ts "Fix Stripe webhook subscription cancellation" --dir /path/to/repo

# Verbose mode (shows live JEV probabilities, frontier queue, and reasoning)
npx tsx src/index.ts "Your task" --verbose

# JSON output (for piping into agents, MCP tools, or pipelines)
npx tsx src/index.ts "Your task" --json
```

Or globally via the symlinked binary:
```bash
jev-researcher "Your task" [--dir <path>] [--verbose] [--json]
```

## Options

| Flag | Description | Default |
|---|---|---|
| `--dir`, `-d` | Path to target repository root | Current working directory |
| `--verbose`, `-v` | Show real-time traversal decisions & probabilities | `false` |
| `--json` | Output structured JSON rather than Markdown | `false` |
| `--max-files` | Maximum files to read content from | `16` |
| `--max-rounds` | Maximum exploration waves | `8` |

## Environment Variables

- `TYPESAFE_API_KEY`: API key for TypeSafe JEV System One (defaults to preconfigured key).
