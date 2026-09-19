<p align="center">
  <img src="assets/logo.png" alt="Hunch Logo" width="180" />
</p>

# Hunch

Fast, zero-string-search repository context gatherer powered by **System One Decision Primitives** ([TypeSafe JEV](https://typesafe.ai) & [OpenJEV](https://github.com/TheoLeeCJ/openjev)).

Given a codebase and a task prompt, `hunch` navigates directory hierarchies using speculative parallel classification, inspects candidate file chunks, extracts verified line snippets, and determines whether gathered context is sufficient for an autonomous coding agent to implement the solution.

---

- 💻 [1. Standalone CLI](#1-standalone-cli)
- 🔌 [2. Agent Plugin (Claude Code & Codex)](#2-agent-plugin-claude-code--codex)
- 📦 [3. Programmatic Node/TS API](#3-programmatic-nodets-api)
- ⚙️ [4. Configuration & Environment Variables](#4-configuration--environment-variables)
- 📊 [5. Preliminary Benchmarks](#5-preliminary-benchmarks)
- 🗺️ [6. Roadmap](#6-roadmap)
- 📄 [License](#license)

---

## 1. Standalone CLI

### Installation

```bash
# Run directly via npx
npx hunch "<task description>"

# Or install globally
pnpm add -g hunch
# or
npm install -g hunch
```

### Quick Start

```bash
# Run against the current repository
hunch "Fix currency exchange rate caching and conversion fallback in fx-service"

# Run against a specific directory with live step telemetry
hunch "Add support for custom webhook signature verification" --dir ./my-repo -v

# Run with local engine (OpenJEV / llama-server)
hunch "Fix edge case in date parsing for leap years" --local

# Output structured JSON payload
hunch "Optimize SQLite query performance for audit logs" --json

# Run local Codex CLI with pre-gathered context injected directly
hunch "Fix edge case in date parsing for leap years" --codex
```

### CLI Options

| Flag | Description | Default |
|---|---|---|
| `--dir, -d <path>` | Target repository path | Current working directory |
| `--verbose, -v` | Stream live traversal steps and probabilities | `false` |
| `--json` | Output machine-readable JSON context package | `false` |
| `--local` | Use local System One engine at `http://127.0.0.1:8080/v1` | `false` |
| `--local-url <url>` | Use local System One engine at specified URL | `undefined` (uses Cloud JEV) |
| `--model, -m <model>` | Local inference model name | `gemma-4-E4B_q4_0-it` |
| `--cloud` | Explicitly force TypeSafe Cloud System One engine | Default |
| `--max-files <num>` | Maximum number of files to inspect | `16` |
| `--max-rounds <num>` | Maximum traversal rounds | `8` |
| `--codex` | Automatically hand off pre-gathered context to Codex | `false` |

---

## 2. Agent Plugin (Claude Code & Codex)

Hunch installs directly as an autonomous hook plugin for **Claude Code** and **Codex CLI**.

### How It Works

When installed as a plugin, Hunch registers a `UserPromptSubmit` hook that intercepts incoming prompts before the coding agent begins execution:

1. **Fast Intent Classification**: Evaluates message intent (`coding_task`, `codebase_research`, `conversation`, `general_question`) using System One classification. Non-code questions and conversational chit-chat bypass traversal immediately (zero latency overhead).
2. **Parallel Speculative Traversal**: For actionable coding tasks, Hunch navigates the codebase directory hierarchy in parallel (~2–7s), inspecting file chunks and scoring line relevance.
3. **Context Injection**: Pinpointed target files and verified line snippets are injected into the agent's context window via `additionalContext`.
4. **Direct Execution**: The coding model skips exploratory research commands (`grep`, `find`, `cat`, directory browsing) and proceeds straight to synthesizing the solution.

### Plugin Layout

```
.
├── plugin.json               # Root plugin manifest
├── .claude-plugin/
│   └── plugin.json           # Claude Code plugin definition
├── .codex-plugin/
│   └── plugin.json           # Codex plugin definition
├── hooks/
│   └── hooks.json            # UserPromptSubmit hook definition
└── rules/
    └── AGENTS.md             # Direct-action instructions for agents
```

### Installing the Plugin

In your Claude Code or Codex workspace:

```bash
# In Claude Code:
claude plugin add /path/to/hunch
```

Or reference this repository directory directly in your agent configuration.

---

## 3. Programmatic Node/TS API

Hunch can be imported directly into Node.js / TypeScript agent workflows:

```typescript
import { createClient, traverseRepository, formatResultMarkdown, classifyPromptIntent } from "hunch";

// 1. Initialize client (Cloud or Local)
const { client } = createClient({ engine: "cloud" });

// 2. Classify prompt intent
const prompt = "Fix race condition in session token refresh handler";
const classification = await classifyPromptIntent(client, prompt);

if (classification.shouldSearch) {
  // 3. Run speculative repo traversal
  const result = await traverseRepository(client, {
    rootDir: process.cwd(),
    task: prompt,
    maxFilesToRead: 16,
    maxRounds: 8,
  });

  // 4. Format context package for LLM ingestion
  const markdown = formatResultMarkdown(result);
  console.log(markdown);
}
```

---

## 4. Configuration & Environment Variables

| Variable | Description | Default |
|---|---|---|
| `HUNCH_API_KEY`, `TYPESAFE_API_KEY` | API Key for [TypeSafe JEV Cloud System One](https://typesafe.ai) | Configured default |
| `HUNCH_LOCAL_URL`, `OPENJEV_URL`, `LOCAL_URL` | Local OpenAI-compatible server endpoint ([OpenJEV](https://github.com/TheoLeeCJ/openjev)) | `undefined` |
| `HUNCH_MODEL`, `OPENJEV_MODEL` | Local inference model name | `gemma-4-E4B_q4_0-it` |
| `HUNCH_ENGINE` | Explicitly choose default engine (`hunch` or `openjev`) | `hunch` |

---

## 5. Preliminary Benchmarks

Early evaluation on a preliminary sample of **5 tasks from SWE-bench Lite** shows promising reductions in context gathering time and exploratory overhead:

- **SWE-bench Lite (5-task preliminary sample)**: Successfully located target files with ~3.4x average speedup in context localization compared to unguided exploration.
- **Decreased Exploration Tool Calls**: Noticeable decrease in agent research tool calls (`grep`, `find`, shell exploration) as candidate files and relevant snippets are pre-injected into the prompt context.
- **Exploration Latency**: ~3–8 seconds parallel traversal vs. multi-minute autonomous tool-calling loops.

> [!NOTE]
> These metrics represent preliminary checks on 5 sample SWE-bench Lite tasks. Full benchmarking across the complete suite is ongoing.

See detailed reports:
- [BENCHMARK_COMPARISON.md](BENCHMARK_COMPARISON.md)
- [ENGINE_COMPARISON.md](ENGINE_COMPARISON.md)
- [SWEBENCH_LITE_REPORT.md](SWEBENCH_LITE_REPORT.md)

---

## 6. Roadmap

- [ ] **Full SWE-bench Lite Benchmark**: Run full evaluation across the complete 300-task SWE-bench Lite dataset.

---

## License

MIT
