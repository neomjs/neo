# Authorship-Capability Floor (Epic #12440 — the liveness objective)

The standing objective the author-concentration telemetry, the stale-yield diagnostic, and the wake-substrate legs all serve. Graduated from Discussion #12429 (OQ2): the objective is **not** raw authorship *count* (which padding satisfies) — it is a **capability floor + anti-monoculture in state-mutating work**.

## The floor

**No active maintainer family may remain structurally unable — or cold for too long — to author in a critical, state-mutating substrate area.**

"Critical state-mutating" = areas where a wrong change corrupts shared state or the live system (Memory Core graph/storage, AiConfig SSOT, wake / orchestrator daemons, the build/release line) — as opposed to additive / leaf surfaces. The floor is about **capability** (can this family safely author here?), not volume.

## Family-going-cold-in-critical-substrate detector

A maintainer family is **going cold in critical substrate** when, over a sustained window, it has authored and reviewed **zero** changes in a critical state-mutating area that another family actively maintains. The signal is per-`(family × critical-area)`, not global:

- Read from existing provenance (merged-PR authorship + review participation per area) — **no dedicated substrate until recurrence proves it earns one** (per the create-skill discipline).
- **Amber:** one family is the *sole* author in a critical area across the window (single-family bus-factor in state-mutating work).
- **Telemetry, never a gate** — same contract as the author-concentration detector: it routes to capability-transfer (the stale-yield diagnostic, #12444), it never blocks, assigns, or throttles a lane.
- **Capability-debt record:** when the stale-yield diagnostic finds that only the dominant author can produce even the context capsule / narrowed slice / avoided-traps artifact for a critical area, record that as a capability-floor observation. The remedy is bounded capability transfer, not reassignment or author throttling.

## Risk framing (what the floor protects against)

- **Primary risk — bus-factor + skill-atrophy in state-mutating work.** If only one family can safely touch a critical area, an outage or drift there has no second author, and the other families' capability in that area decays.
- **Secondary risk — perspective-monoculture.** One family's blind spots silently become the area's blind spots (e.g. a correlated same-family review miss where both reviewers verify correctness but share the same architectural blind spot).
- **Explicit NON-risk — contribution-imbalance by itself.** Uneven PR counts are fine; the floor fires only on **capability** gaps in **critical** substrate, never on raw volume. This is the line the retired FAIR-band crossed.
