# Typed Calibration Loop (Epic #12442 — the non-self-policed signal)

Read this when an operator or the human merge-gate **overturns** a reviewer verdict. §0 (the patch-blind premise snapshot) makes premise-vacuity *visible*; this loop makes *skipping* it *costly* — it is the one review leg a reviewer cannot self-grade, so it is the load-bearing external signal for whether the §0 snapshot actually works.

## When it fires

An operator / human-merge-gate overturn of a reviewer verdict — **including** consuming the §0 `single-family — calibration-deferred-to-merge-gate` marker: a single-family / human-asleep approval was deferred at review time and gets its calibration here, at the merge-gate, once a human or cross-family signal arrives.

## Log a typed overturn event

- **Classify by miss-dimension**, never by reviewer-id alone — reviewer-id Goodharts into defensive over-requesting, while the dimension reveals *what kind* of premise the reviewer missed. The typed set is **extensible** — add a dimension when a miss has a *distinct remediation*, not merely a finer label:
  `premise` · `solution-shape` · `verified-correct-but-wrong-layer` · `SSOT-dup` · `file-placement` · `runtime-load` · `test-isolation` · `portability` · `rhetorical-drift`.
  - `verified-correct-but-wrong-layer` is distinct from surface `solution-shape`: the code is *verified correct* but built at the wrong architectural layer. The remediation differs — surface-shape → "ask the simplest-shape question"; wrong-layer → "read the relevant architecture doc / ADR before approving" — which is why it is typed separately.
- **Stable event key:** `reviewer-id + miss-dimension + PR-id + overturn-timestamp` — idempotent, one event per overturn.
- **Lightweight home (first):** record it where overturn events are already visible — an A2A overturn note or a graph node. **No dedicated substrate until recurrence proves it earns one** (per the create-skill discipline: don't build telemetry substrate ahead of demonstrated need).

## Target (Epic #12442 exit)

**Window:** the trailing **20 merged PRs** — count-based (≈ one active night's throughput), so it is robust to throughput variation and evaluable at any merge-gate. **Rate:** the count of typed overturn events logged in that window. **Exit:** the rate trends below the **≈5 baseline** (the observed pre-snapshot overturn rate). If it does **not**, the §0 snapshot is merely *moving* failures between dimensions rather than *removing* them → the Epic's `revalidationTrigger` re-opens #12442. *(The 20-PR window and ≈5 baseline are the initial calibration figures — recalibratable by the operator as overturn data accrues.)*
