# gemma4 REM-Pipeline Cost Benchmark

> **Status (2026-05-27):** Phase 1 — harness shipped, baseline numbers pending operator run.
> **Owner:** Epic #12065 Sub 8 ([#12074](https://github.com/neomjs/neo/issues/12074))

## Why this exists

Operator directive on 2026-05-27 during Discussion [#12062](https://github.com/neomjs/neo/discussions/12062) graduation:

> *"we need benchmarking for gemma4 => creating context windows is the most expensive task. if there is any way to REUSE created context windows => big win."*

Each `SemanticGraphExtractor.executeTriVectorExtraction` invocation today opens a fresh gemma4 context for one LLM call. With session payloads up to **256K tokens** (after the [#12063](https://github.com/neomjs/neo/issues/12063) / PR #12064 context-limit raise) and ~10 sessions per REM cycle, the cumulative **context-creation cost may dominate the actual inference cost**.

If KV-cache reuse works at the provider layer, we can drop per-cycle wall-clock from `MINUTES × N` to `MINUTES + tiny-deltas` — a 5-20× speedup. This document captures the protocol, the empirical baseline (when run), and the integration recommendations for Sub 3 (`executeRemCycle`) + Sub 7 (hierarchical summarization chunking).

## Substrate V-B-A findings (pre-benchmark)

Findings from reading the provider substrate on branch `feature-12074-gemma4-bench`:

| File | Line | Observation |
|------|------|-------------|
| `ai/provider/Ollama.mjs` | 108 | `generate()` hardcodes `keep_alive: "1h"` BEFORE serialization — heavy non-streaming graph calls (production `SemanticGraphExtractor.executeTriVectorExtraction` path) get the long lease unconditionally |
| `ai/provider/Ollama.mjs` | 267-276 | `stream()` builds the payload via `preparePayload()` (lines 48-95) which does NOT inject a top-level `keep_alive` default; if the caller omits it, native Ollama uses its built-in default (5min for `/api/chat`). Caller-supplied `keep_alive` IS propagated when set explicitly via `options` |
| `ai/provider/OpenAiCompatible.mjs` | 146 + `preparePayload()` 91-106 | `stream()` propagates arbitrary remaining `options` into the JSON payload via `Object.assign(payload, clonedOptions)` — so caller-supplied `keep_alive` IS mechanically forwarded. **Unverified residual:** whether the OpenAI-compatible server (LM Studio, llama.cpp, vLLM, Ollama's own `/v1/...` surface) honors the non-standard `keep_alive` extension. Each backend has different cache-retention semantics; the probe characterizes one specific server at a time |
| `ai/services/graph/SemanticGraphExtractor.mjs` | 134 | `provider.generate(messages)` — non-streaming; Ollama-native path WILL get keep_alive=1h via the hardcoded default in `Ollama.generate()` |
| `ai/services/graph/SemanticGraphExtractor.mjs` | 99 | Provider dispatched via `buildGraphProvider({modelProvider})` — both Ollama and OpenAI-compat routes possible per operator config |

**Implication (narrowed):** The bench harness uses `provider.stream()` to measure TTFT. For the streaming path specifically: Ollama-native streamed calls don't get the hardcoded keep_alive=1h that `generate()` enjoys (unless caller passes it explicitly via `--keep-alive`), and OpenAI-compat streamed calls mechanically forward `keep_alive` but server-honor is unverified. The empirical probe characterizes the operator's specific deployed server, not a universal claim.

## Scripts

### `ai/scripts/benchmark/gemma4-rem-benchmark.mjs`

Per-bucket cost characterization. Streams identical-shape prompts at 4 size buckets and records TTFT / TTLT / tps per call.

```bash
# All buckets, 3 iterations + 1 warmup each (default)
node ai/scripts/benchmark/gemma4-rem-benchmark.mjs

# Single bucket, 5 iterations
node ai/scripts/benchmark/gemma4-rem-benchmark.mjs --size large --iterations 5

# Override provider keep_alive (Ollama-native only)
node ai/scripts/benchmark/gemma4-rem-benchmark.mjs --size medium --keep-alive 1h
```

Output: console table + JSON at `.neo-ai-data/benchmarks/gemma4-rem-{timestamp}.json`.

### `ai/scripts/benchmark/keep-alive-probe.mjs`

Empirical V-B-A of provider KV-cache reuse. Two back-to-back identical calls; compares TTFT delta.

```bash
# Both reuse-test (keep_alive=1h) AND control (keep_alive=0)
node ai/scripts/benchmark/keep-alive-probe.mjs

# Just the reuse test
node ai/scripts/benchmark/keep-alive-probe.mjs --mode reuse
```

**Interpretation matrix:**

| keep_alive=1h call-2 TTFT | keep_alive=0 call-2 TTFT | Verdict |
|---------------------------|--------------------------|---------|
| ≪ call-1 TTFT | ≈ call-1 TTFT | Reuse working, controlled by keep_alive ✓ |
| ≪ call-1 TTFT | ≪ call-1 TTFT | Reuse happening but NOT controlled by keep_alive — provider may cache by default |
| ≈ call-1 TTFT | ≈ call-1 TTFT | No reuse — provider doesn't honor keep_alive (or cache disabled server-side) |
| ≫ call-1 TTFT | any | Something is wrong; probe needs investigation |

## Measurement protocol

1. **Stop the orchestrator daemon** (`pkill -f "ai/daemons/orchestrator"`) — REM pipeline running in parallel would contaminate the cache state.
2. **Cold-start the gemma server** — restart Ollama / LM Studio so we start from empty KV cache.
3. **Run the size-bucket benchmark first** — characterizes cost-per-byte without the warmup interaction:
   ```bash
   node ai/scripts/benchmark/gemma4-rem-benchmark.mjs --iterations 5
   ```
4. **Run the keep-alive probe** — proves or disproves reuse:
   ```bash
   node ai/scripts/benchmark/keep-alive-probe.mjs
   ```
5. **Restart the orchestrator** to resume normal operation.

## Baseline measurements

**TO BE FILLED** by operator on first run. Template:

### Provider: `<TBD>`, model: `<TBD>`, host: `<TBD>`

| Bucket | promptTokens | TTFT median | TTLT median | tps median | outputChars median |
|--------|--------------|-------------|-------------|------------|--------------------|
| small  | ~5K  | _ms_ | _ms_ | _t/s_ | _chars_ |
| medium | ~30K | _ms_ | _ms_ | _t/s_ | _chars_ |
| large  | ~100K | _ms_ | _ms_ | _t/s_ | _chars_ |
| max    | ~200K | _ms_ | _ms_ | _t/s_ | _chars_ |

### keep_alive probe verdict

- keep_alive=1h, call-1 TTFT: _ms_, call-2 TTFT: _ms_, delta: _ms_
- keep_alive=0,  call-1 TTFT: _ms_, call-2 TTFT: _ms_, delta: _ms_
- **Verdict:** _Reuse active / Reuse inactive / Inconclusive_

## Integration recommendations

To be filled after baseline + probe data lands. Decision tree:

### If reuse is ACTIVE and controlled by keep_alive

- **Sub 3 (`executeRemCycle`)** — set `keep_alive` consistently across the batch (`"1h"` or longer); ensure provider options propagate through `buildGraphProvider` callsites.
- **Sub 7 (hierarchical summarization)** — batch all chunks of one session under one keep_alive window; consider one orchestrator-owned long-lived gemma process per cycle.
- **Provider parity fix** — patch `Ollama.stream()` and `OpenAiCompatible.stream()` to pass `keep_alive` (currently dropped). File as Sub-8 follow-up or as a separate PR.

### If reuse is INACTIVE

- **Architectural escalation** — propose orchestrator-owned long-running gemma server lifecycle (not per-call); document in Sub 3 ACs.
- **Cost-asymmetry quantification** — measure and publish the per-cycle wall-clock so the orchestrator can budget honestly.
- **Provider documentation gap** — the operator-facing config docs should warn that the chosen provider doesn't reuse, so deployment cost is predictable.

## Related

- Epic [#12065](https://github.com/neomjs/neo/issues/12065) — Orchestrator-as-SSOT for the REM (Sandman) Pipeline
- [#12063](https://github.com/neomjs/neo/issues/12063) / PR [#12064](https://github.com/neomjs/neo/pull/12064) — context-limit raise to 256K (enables benchmarking at realistic payload sizes)
- [#12067](https://github.com/neomjs/neo/issues/12067) — Sub 1: silent-failure root-cause investigation (parallel investigation)
- [#12073](https://github.com/neomjs/neo/issues/12073) — Sub 7: hierarchical-summarization (consumer of keep_alive-batching finding)
- Discussion [#12062](https://github.com/neomjs/neo/discussions/12062) §2.4.1 — cost-asymmetry framing + OQ11 hot-fix lineage
