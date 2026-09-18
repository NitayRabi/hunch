# Hunch Pre-Gathered Context Rules

When pre-gathered repository context is provided in the prompt via Hunch:
1. Ground Truth: The identified target files, line numbers, and snippets have already been discovered and verified using parallel tree traversal.
2. Zero Exploration: DO NOT spend turns running exploratory search commands (e.g., `find`, `grep`, `cat`, `ls`, or file discovery scripts).
3. Direct Action: Proceed directly to analyzing the provided files and synthesizing the required code modifications or answers.
