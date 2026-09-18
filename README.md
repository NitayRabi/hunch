<p align="center">
  <img src="assets/logo.png" alt="Hunch Logo" width="180" />
</p>

# Hunch

Fast, zero-string-search repository context gatherer powered by **System One Decision Primitives** ([TypeSafe JEV](https://typesafe.ai) & [OpenJEV](https://github.com/TheoLeeCJ/openjev)).

Given a codebase and a task prompt, `hunch` navigates directory hierarchies using speculative parallel classification, inspects candidate file chunks, extracts verified line snippets, and determines whether gathered context is sufficient for an autonomous coding agent to implement the solution.

---

- 💻 [Run Standalone](#1-standalone-cli)
- 🔌 [Configure as Coding Plugin](#2-hunch-plugin-for-coding-agents)
- ⚙️ [Configuration & Environment Variables](#3-configuration--environment-variables)
- 📊 [Benchmarks & Reports](#4-benchmark-highlights)

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
| `--local-url <url>` | Use local System One engine at specified URL | `undefined` (uses Cloud JEV) |
| `--local, --openjev` | Use local System One engine at `http://127.0.0.1:8080/v1` | `false` |
| `--model, -m <model>` | Local inference model name | `gemma-4-E4B_q4_0-it` |
| `--hunch, --cloud` | Explicitly force TypeSafe Cloud System One engine | Default |
| `--max-files <num>` | Maximum number of files to inspect | `16` |
| `--max-rounds <num>` | Maximum traversal rounds | `8` |
| `--codex` | Automatically hand off pre-gathered context to Codex | `false` |

---

## 2. Hunch Plugin for Coding Agents

Hunch can be installed directly as a plugin for **Claude Code** and **Codex CLI**.

### How It Works

When installed as a plugin, Hunch registers a `UserPromptSubmit` hook:
1. When you enter a prompt in Claude Code or Codex, the hook intercepts the task.
2. Hunch executes parallel speculative tree traversal in the background (~2-7s).
3. Exact target files and relevant snippets are injected into the agent's context window.
4. The agent skips exploratory search commands (`find`, `grep`, `ls`, `cat`) and proceeds straight to synthesizing the fix.

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

In Claude Code or Codex workspace:

```bash
# In your Claude Code settings or plugins directory:
claude plugin add /path/to/hunch
```

Or reference this repository directory directly in your agent configuration.

---

## 3. Configuration & Environment Variables

| Variable | Description | Default |
|---|---|---|
| `HUNCH_API_KEY`, `TYPESAFE_API_KEY` | API Key for [TypeSafe JEV Cloud System One](https://typesafe.ai) | Configured default |
| `HUNCH_LOCAL_URL`, `OPENJEV_URL`, `LOCAL_URL` | Local OpenAI-compatible server endpoint ([OpenJEV](https://github.com/TheoLeeCJ/openjev)) | `undefined` |
| `HUNCH_MODEL`, `OPENJEV_MODEL` | Local inference model name | `gemma-4-E4B_q4_0-it` |
| `HUNCH_ENGINE` | Explicitly choose engine (`hunch` or `openjev`) | `hunch` |

---

## 4. Benchmark Highlights

Pre-gathering repository context with Hunch significantly reduces agent execution time, context window pollution, and token usage:

- **SWE-bench Lite**: 100% target file hit rate with **3.4x average overall speedup** over stock autonomous exploration.
- **Zero Shell Tool Overhead**: Coding models execute fixes in a single turn without wandering across unrelated files.
- **Exploration Latency**: ~3–8 seconds parallel traversal vs. multi-minute autonomous tool-calling loops.

See detailed reports:
- [BENCHMARK_COMPARISON.md](BENCHMARK_COMPARISON.md)
- [ENGINE_COMPARISON.md](ENGINE_COMPARISON.md)
- [SWEBENCH_LITE_REPORT.md](SWEBENCH_LITE_REPORT.md)

---

## License

MIT
