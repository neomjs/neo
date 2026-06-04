# Typed Calibration Loop (Epic #12442 — the non-self-policed signal)

Read this when an operator or the human merge-gate **overturns** a reviewer verdict. §0 (the patch-blind premise snapshot) makes premise-vacuity *visible*; this loop makes *skipping* it *costly* — it is the one review leg a reviewer cannot self-grade, so it is the load-bearing external signal for whether the §0 snapshot actually works.

## When it fires

An operator / human-merge-gate overturn of a reviewer verdict — **including** consuming the §0 `single-family — calibration-deferred-to-merge-gate` marker: a single-family / human-asleep approval was deferred at review time and gets its calibration here, at the merge-gate, once a human or cross-family signal arrives.

## Log a typed overturn event

- **Classify by miss-dimension**, never by reviewer-id alone — reviewer-id Goodharts into defensive over-requesting, while the dimension reveals *what kind* of premise the reviewer missed:
  `premise` · `solution-shape` · `SSOT-dup` · `file-placement` · `runtime-load` · `test-isolation` · `portability` · `rhetorical-drift`.
- **Stable event key:** `reviewer-id + miss-dimension + PR-id + overturn-timestamp` — idempotent, one event per overturn.
- **Lightweight home (first):** record it where overturn events are already visible — an A2A overturn note or a graph node. **No dedicated substrate until recurrence proves it earns one** (per the create-skill discipline: don't build telemetry substrate ahead of demonstrated need).

## Target (Epic #12442 exit)

The typed-calibration rate trends below the ≈5 baseline over a defined review window. If it does **not**, the §0 snapshot is merely *moving* failures between dimensions rather than *removing* them → the Epic's `revalidationTrigger` re-opens #12442.
