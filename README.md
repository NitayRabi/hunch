# JEV Researcher

Fast, zero-string-search repository traverser powered by **System One Decision Primitives** (TypeSafe JEV & OpenJEV).

Given a codebase and a task prompt, `jev-researcher` traverses directory hierarchies using speculative parallel classification, inspects promising file contents at calibrated thresholds, extracts exact line snippets, and determines whether the gathered context is sufficient for an autonomous coding agent to implement the solution.

---

## Key Design Principles

1. **No Keyword or String Search**: Evaluates typed probabilistic primitives (`noul`, `choice`, `score`) directly on structured filesystem state.
2. **Default Cloud JEV / Optional Local Engine**:
   - **Default**: TypeSafe JEV Cloud API.
   - **Local Engine**: Activated simply by providing `--local-url <url>`, `--local`, or setting `OPENJEV_URL` / `LOCAL_URL`. Connects to any standard OpenAI-compatible server (`llama-server`, `vLLM`, `llama-swap`, `Ollama`).
   - **Zero Weight**: No LLM model weights or native binaries are bundled.
3. **Speculative Parallel Fan-Out**: Evaluates sibling directory entries in parallel batches using sub-second classification.
4. **Geometric-Mean Length Normalization**: Deep directories are scored fairly against shallow directories using geometric mean path probabilities (`exp(sum(log(p)) / depth)`).
5. **Content Chunking & Role Classification**: Evaluates candidate files into `modify`, `reference`, or `irrelevant`, and extracts relevant line-numbered snippets.
6. **Sufficiency Termination Gate**: Runs a sufficiency check after each wave to verify whether gathered context is sufficient to fix the task, terminating early once complete.

---

## Installation & Usage

### 1. Default (TypeSafe JEV Cloud API)
```bash
# Target a repository with standard cloud JEV
npx tsx src/index.ts "Fix currency exchange rate caching in fx-service" --dir /path/to/repo
```

### 2. Local Mode with a Single Parameter
```bash
# Pass local URL directly (automatically activates local engine):
npx tsx src/index.ts "Fix currency exchange rate caching in fx-service" --local-url http://127.0.0.1:8081/v1

# Or use default local port (http://127.0.0.1:8080/v1):
npx tsx src/index.ts "Fix currency exchange rate caching in fx-service" --local

# With optional custom model name:
npx tsx src/index.ts "Fix currency exchange rate caching in fx-service" \
  --local-url http://127.0.0.1:8081/v1 \
  --model gemma-4-E4B_q4_0-it
```

### 3. Or via Environment Variables
```bash
# Setting OPENJEV_URL or LOCAL_URL automatically routes all executions locally
export OPENJEV_URL=http://127.0.0.1:8081/v1
npx tsx src/index.ts "Fix currency exchange rate caching in fx-service"
```

---

## CLI Options

| Flag | Description | Default |
|---|---|---|
| `--local-url <url>` | Use local System One engine at specified URL (single param) | `undefined` (uses cloud JEV) |
| `--local` | Use local System One engine at default `http://127.0.0.1:8080/v1` | `false` |
| `--model`, `-m <name>` | Model identifier on local inference server | `gemma-4-E4B_q4_0-it` |
| `--jev` | Explicitly use TypeSafe JEV cloud API | Default |
| `--dir`, `-d <path>` | Path to target repository root | Current working directory |
| `--verbose`, `-v` | Show real-time traversal decisions & probabilities | `false` |
| `--json` | Output structured JSON rather than Markdown | `false` |
| `--codex` | Hand off pre-gathered context to local Codex CLI agent | `false` |
| `--max-files <num>` | Maximum files to read content from | `16` |
| `--max-rounds <num>` | Maximum exploration waves | `8` |

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `OPENJEV_URL`, `LOCAL_URL` | Set local server endpoint (automatically activates local engine) | `undefined` (uses cloud JEV) |
| `OPENJEV_MODEL` | Target model name on local server | `gemma-4-E4B_q4_0-it` |
| `TYPESAFE_API_KEY` | API key for TypeSafe JEV System One | Configured default |

---

## Engine Benchmark

Run side-by-side comparative benchmarks across local repositories:
```bash
npm run compare
# or
npx tsx scripts/compare-engines.ts
```
See [`ENGINE_COMPARISON.md`](ENGINE_COMPARISON.md) for quality and speed comparisons.
