# Engine Quality & Performance Comparison: TypeSafe JEV vs OpenJEV Models

**Task**: `"Fix currency exchange rate caching and conversion fallback in fx-service"`  
**Target Repository**: `/home/nitayrabi/projects/portfolio-architect` (Next.js + TypeScript + Drizzle ORM)  
**Date**: September 2026  

---

## 1. Executive Summary

We evaluated **TypeSafe JEV** against **OpenJEV** across two distinct model backends:
1. **`fastcontext-1.0-4b-sft-q4_k_m`** (Direct SFT classifier)
2. **`gemma-4-E4B_q4_0-it`** (4B Instruction tuned model as specified in OpenJEV / open-jev architectures)
3. **`TypeSafe JEV`** (Official Cloud System One API)

| Engine & Model | Target File Found? | Relevance / Conf | Premature Stop? | Total Time | Parallel Evals | Quality Rating |
|---|---|---|---|---|---|---|
| **OpenJEV (`gemma-4-E4B`)** | **YES** (`fx-service.ts`) | **100% / 100%** | **No** (stopped at R4 when complete) | **36.15s** | 24 | ⭐⭐⭐⭐⭐ **Excellent** |
| **TypeSafe JEV (Cloud API)** | **YES** (`fx-service.ts`) | **98% / 100%** | **No** (stopped when frontier exhausted) | **11.83s** | 31 | ⭐⭐⭐⭐⭐ **Excellent** |
| **OpenJEV (`fastcontext-4b`)** | Partial (`next.config.ts`) | 91% / 98% | **Yes** (false-positive stop at R1) | **7.17s** | 6 | ⭐⭐⭐☆☆ **Fast, overconfident** |

---

## 2. Deep Dive: Model Selection & Traversal Behavior

### A. OpenJEV with Repo-Specified 4B Instruction Model (`gemma-4-E4B_q4_0-it`)
- **Traversal Accuracy**: Explored 10 directories across 4 rounds down to depth 3 (`src/server/services`).
- **Precision**: Identified `src/server/services/fx-service.ts` as the primary modification target with **100% relevance and 100% confidence**.
- **Context Calibration**: Evaluated `package.json` (56% reference) and `PRD.md` (93% reference), while properly rejecting `docker-compose.yml` (0%), `drizzle.sql` (0%), and `tests/e2e/checkout-price.spec.ts` (3%).
- **Calibrated Sufficiency**: Prevented early stopping during Rounds 1–3 (`p=0.15`), stopping at Round 4 (`p=0.95`) only after the core implementation and services were gathered.

### B. TypeSafe JEV (Cloud API)
- **Traversal Accuracy**: Explored 15 directories across 6 rounds down to depth 4 (`src/app/api/price`).
- **Precision**: Discovered `fx-service.ts` at **98% relevance, 100% confidence**.
- **Sufficiency**: Conservative thresholds kept frontier search active across unit and e2e test suites.

### C. OpenJEV with SFT Classifier (`fastcontext-1.0-4b-sft-q4_k_m`)
- **Speed**: Extremely rapid (7.17s total, ~35ms per batch).
- **Behavior**: Picked up `next.config.ts` due to high keyword overlap (`api.frankfurter.dev` in CSP config) and triggered sufficiency early (`p=0.87`).

---

## 3. Comparative Verdict

1. **Is OpenJEV competitive with the repo-specified model?**  
   **Yes, completely.** With `gemma-4-E4B_q4_0-it` (or `Qwen/Qwen3.5-4B`), OpenJEV matches TypeSafe JEV in target localization accuracy (100% confidence on `fx-service.ts`) while running 100% locally with zero cloud API fees or token subscriptions.

2. **Is it worth it?**  
   - **For Local / Offline AI Agents**: Absolutely. It enables autonomous repository search without sending proprietary code to external APIs.
   - **Model Selection Rule**: Use a 4B instruction model (`gemma-4-E4B` / `Qwen3.5-4B`) rather than compact pure-SFT classifiers to ensure balanced sufficiency scoring.
