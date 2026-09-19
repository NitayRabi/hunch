# Engine Comparison Benchmark: Hunch Cloud vs OpenJEV

**Target Repository**: `portfolio-architect`  
**Task**: *Fix currency exchange rate caching and conversion fallback in fx-service*  
**Local Inference Model**: `fastcontext-1.0-4b-sft-q4_k_m` (via `http://127.0.0.1:8080/v1`)  
**TypeSafe API**: `https://api.typesafe.ai/v1/system-one`  

---

## 1. Quantitative Performance Comparison

| Metric | Hunch (Cloud API) | OpenJEV (Local Logits Readout) | Comparison / Notes |
|---|---|---|---|
| **Architecture** | Remote TypeSafe System One API | Local Fastcontext SFT + Direct Logits Readout | Zero network latency vs cloud managed |
| **Exploration Time** | **10.54s** | **90.10s** | OpenJEV is **0.1x faster** |
| **System One Requests** | 32 parallel batches | 1 parallel batches | Tree search evaluations |
| **Directories Explored** | 15 (, src, tests...) | 1 (....) | Frontier branch expansion |
| **Files Inspected** | 13 files | 0 files | Candidate files read & chunked |
| **Target Files Identified** | src/server/services/fx-service.ts (p=98%, conf=100%) | None | Isolated target problem area |
| **Reference Files** | None | None | Contextual dependencies |
| **Context Snippets** | 1 snippets (155 lines) | 0 snippets (0 lines) | Focused context size |
| **Context Sufficiency** | p=0.35 (Sufficient) | p=0.00 (Not started) | Early termination trigger |

---

## 2. Feature Flag Usage & Configuration

You can seamlessly switch between Hunch Cloud and OpenJEV via command line arguments or environment variables:

```bash
# 1. Run with Hunch (Cloud API):
hunch "Fix currency exchange rate caching in fx-service" --hunch

# 2. Run with OpenJEV (Local fastcontext-4b model):
hunch "Fix currency exchange rate caching in fx-service" --openjev
# Or shorthand:
hunch "Fix currency exchange rate caching in fx-service" --local

# 3. Via Environment Variable:
export HUNCH_ENGINE=openjev
# or
export USE_OPENJEV=1
```

---

## 3. Pre-Gathered Context Packages

### Hunch Cloud Context Package:
```markdown
# Hunch Repo Context Package
**Task**: Fix currency exchange rate caching and conversion fallback in fx-service
**Sufficiency**: PARTIAL (p=0.35, readiness: Sufficient [1.5/3.0])
**Traversed**: 15 dirs, 13 files inspected, 32 evaluations in 10.54s

---

## 1. Target Files to Modify (1)
### `src/server/services/fx-service.ts` (Relevance: 98%, Confidence: 100%)
#### Lines 1-155
```
L1: import { and, eq } from "drizzle-orm";
L2: 
L3: import { db } from "@/lib/drizzle/db";
L4: import { fxRateCache } from "@/lib/drizzle/schema";
L5: 
L6: const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
L7: 
L8: function getStandardCurrencyAndScale(currency: string): { currency: string; scale: number } {
L9:   const cur = currency.toUpperCase();
L10:   if (cur === "ILA") {
L11:     return { currency: "ILS", scale: 0.01 };
L12:   }
L13:   if (cur === "GBX" || cur === "GBP_PENCE" || cur === "GBP-PENCE") {
L14:     return { currency: "GBP", scale: 0.01 };
L15:   }
L16:   if (cur === "ZAC" || cur === "ZAR_CENTS") {
L17:     return { currency: "ZAR", scale: 0.01 };
L18:   }
L19:   return { currency: cur, scale: 1 };
L20: }
L21: 
L22: export async function getFxRate(
L23:   baseCurrency: string,
L24:   quoteCurrency: string,
L25: ): Promise<number> {
L26:   const baseInfo = getStandardCurrencyAndScale(baseCurrency);
L27:   const quoteInfo = getStandardCurrencyAndScale(quoteCurrency);
L28: 
L29:   const base = baseInfo.currency;
L30:   const quote = quoteInfo.currency;
L31: 
L32:   const scaleMultiplier = baseInfo.scale / quoteInfo.scale;
L33: 
L34:   if (base === quote) {
L35:     return scaleMultiplier;
L36:   }
L37: 
L38:   // 1. Try to get from cache
L39:   const cached = await db.query.fxRateCache.findFirst({
L40:     where: and(
L41:       eq(fxRateCache.baseCurrency, base),
L42:       eq(fxRateCache.quoteCurrency, quote),
L43:     ),
L44:   });
L45: 
L46:   const now = new Date();
L47:   const isFresh = cached && (now.getTime() - cached.createdAt.getTime() < TTL_MS);
L48: 
L49:   if (isFresh && cached) {
L50:     return cached.rate * scaleMultiplier;
L51:   }
L52: 
L53:   // 2. Fetch from Frankfurter API
L54:   try {
L55:     const url = `https://api.frankfurter.dev/v2/rates?base=${base}&quotes=${quote}`;
L56:     const response = await fetch(url);
L57:     if (!response.ok) {
L58:       const errBody = (await response.json().catch(() => ({}))) as { message?: string };
L59:       const message = errBody.message ?? response.statusText;
L60:       throw new Error(`Frankfurter API error: ${message}`);
L61:     }
L62: 
L63:     const data = (await response.json()) as Array<{
L64:       base: string;
L65:       quote: string;
L66:       rate: number;
L67:       date: string;
L68:     }>;
L69: 
L70:     const item = data.find((r) => r.base === base && r.quote === quote);
L71:     if (!item) {
L72:       throw new Error(`Rate from ${base} to ${quote} not found in API response`);
L73:     }
L74: 
L75:     const rate = item.rate;
L76: 
L77:     // 3. Store/Update in cache
L78:     if (cached) {
L79:       await db
L80:         .update(fxRateCache)
L81:         .set({
L82:           rate,
L83:           asOf: new Date(item.date),
L84:           createdAt: now,
L85:         })
L86:         .where(eq(fxRateCache.id, cached.id));
L87:     } else {
L88:       await db.insert(fxRateCache).values({
L89:         id: crypto.randomUUID(),
L90:         baseCurrency: base,
L91:         quoteCurrency: quote,
L92:         rate,
L93:         asOf: new Date(item.date),
L94:         createdAt: now,
L95:       });
L96:     }
L97: 
L98:     return rate * scaleMultiplier;
L99:   } catch (error) {
L100:     console.error(`Error fetching FX rate for ${base} -> ${quote}:`, error);
L101: 
L102:     // 4. Fallback to expired cached rate if it exists
L103:     if (cached) {
L104:       console.warn(`Falling back to expired cached rate for ${base} -> ${quote}`);
L105:       return cached.rate * scaleMultiplier;
L106:     }
L107: 
L108:     throw error;
L109:   }
L110: }
L111: 
L112: export async function refreshFxRates() {
L113:   const cachedRates = await db.query.fxRateCache.findMany();
L114:   let updatedCount = 0;
L115: 
L116:   for (const rateRow of cachedRates) {
L117:     try {
L118:       const url = `https://api.frankfurter.dev/v2/rates?base=${rateRow.baseCurrency}&quotes=${rateRow.quoteCurrency}`;
L119:       const response = await fetch(url);
L120:       if (response.ok) {
L121:         const data = (await response.json()) as Array<{
L122:           base: string;
L123:           quote: string;
L124:           rate: number;
L125:           date: string;
L126:         }>;
L127:         const item = data.find(
L128:           (r) => r.base === rateRow.baseCurrency && r.quote === rateRow.quoteCurrency,
L129:         );
L130:         if (item) {
L131:           await db
L132:             .update(fxRateCache)
L133:             .set({
L134:               rate: item.rate,
L135:               asOf: new Date(item.date),
L136:               createdAt: new Date(),
L137:             })
L138:             .where(eq(fxRateCache.id, rateRow.id));
L139:           updatedCount++;
L140:         }
L141:       }
L142:     } catch (err) {
L143:       console.error(
L144:         `Failed to refresh rate for ${rateRow.baseCurrency} -> ${rateRow.quoteCurrency}:`,
L145:         err,
L146:       );
L147:     }
L148:   }
L149: 
L150:   return {
L151:     updated: updatedCount,
L152:     baseCurrency: "EUR",
L153:   };
L154: }
L155: 
```

---

## 2. Reference & Context Files (0)
*No reference files identified.*
```

### OpenJEV Context Package:
```markdown
# Hunch Repo Context Package
**Task**: Fix currency exchange rate caching and conversion fallback in fx-service
**Sufficiency**: PARTIAL (p=0.00, readiness: Not started [0.0/3.0])
**Traversed**: 1 dirs, 0 files inspected, 1 evaluations in 90.10s

---

## 1. Target Files to Modify (0)
*No primary modification targets identified.*
---

## 2. Reference & Context Files (0)
*No reference files identified.*
```
