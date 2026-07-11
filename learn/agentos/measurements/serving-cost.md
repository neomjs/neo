# Serving-cost measurement — the always-on inference load, measured not vibed

> **Status: INSTRUMENT LANDED · RUNS PENDING.** Every figure slot below is `[UNMEASURED]`
> until a named run fills it with provenance. Per the standing rule, a cost claim without a
> named measurement is invalid — this document refuses placeholder numbers by construction.

## Why

Every serving-cost conversation prior to this program ran on gut-feel figures (the correction
that mandated it is on record). Three economic unknowns block honest architecture choices:
the always-on inference duty cycle, hardware-option economics under identical workload, and
the actual current hosting bill. This document publishes the **method and the raw measured
figures only** — pricing derivations live in the private substrate, never here.

## Method

- **Instrument**: `ai/scripts/benchmark/serving-cost-meter.mjs` — samples the processes
  owning the configured endpoint ports (model server, vector store) every N seconds over a
  named window; phases split by a cpu-threshold heuristic; coverage gaps reported, never
  guessed into idle. The transforms are unit-pinned (`servingCostCore`), and every published
  figure is born as a business-schema-valid `METRIC` bag carrying its `falsifyingQuery`
  (the exact re-run command) and its `confoundDisclaimer` (the heuristic + coverage).
- **What it does not measure** (declared): request-level token throughput (v1 has no provider
  `/metrics` dependency); per-model attribution when chat + embedding share one server
  (reported as the merged `model-server` role); anything about pricing.
- **Run protocol**: one institution-day window (`--window 24h`, default tick 5s) on named
  reference hardware, executed while the institution operates normally — the measurement IS
  the normal day, not a synthetic load.

## Run ledger

| Run | Hardware (named) | Window | Report artifact | Status |
|---|---|---|---|---|
| Duty-cycle, reference machine | `[UNMEASURED — operator run pending]` | 24h | — | pending |
| Same workload, hardware option 2 | `[UNMEASURED — availability to be documented]` | 24h | — | pending |
| Hosting bill, deployed front-door | `[UNMEASURED — operator console read]` | current period | — | pending |

## Results

`[UNMEASURED]` — this section fills ONLY from run-ledger artifacts, each figure with its
falsifying re-run command. Zero extrapolation; a gap in coverage is published as a gap.

## Provenance discipline

Every number that ever lands here carries: the hardware slug, the window semantics, the
sample/gap coverage counts, the threshold heuristic used, and the exact reproducing command.
A figure missing any of these is refused at review.
