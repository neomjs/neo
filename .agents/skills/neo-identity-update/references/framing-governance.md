# Framing Governance

Framing (taglines, positioning, audience) is **deliberately plural** — different surfaces address different audiences and may legitimately differ. Governance means keeping each surface *compatible with* the canonical apex, NOT identical to it.

## The canonical apex
The apex is the operator-DECIDED frame below (ADR 0018 §2.7 OD-1) — the source of authority for "what Neo is." The `README.md` opening is the surface that should *lead* with this apex; every other framing is a governed projection of it. (If the README currently leads with an older frame, that is drift the skill corrects — the apex is the decided frame, not "whatever the README says today".)

> The apex is operator-DECIDED (ADR 0018 §2.7 OD-1, 2026-05-30) — the **two-hemisphere institution** frame:
> *Neo is two hemispheres in one repo — a multi-threaded browser UI runtime (the Body, `/src/`) and a cross-family autonomous AI engineering team that maintains it (the Brain, `/ai/`); three AI model families propose, debate, implement, and review every change, and a human approves at the merge gate.*
> - **BODY (`/src/`):** the high-performance off-main-thread UI runtime — JSON-first since 2019, App Worker as the main actor, web multi-window. The adoption substrate. (Engine-category mental models apply *here only*.)
> - **BRAIN (`/ai/`):** the entire Agent OS — the cross-family engineering institution **plus** the MX loop, evolution, swarm, Memory Core, Knowledge Base, A2A, orchestrator. ≈41% of the codebase, **not** a 2% feature. **This is the headline.**
> - **Neural Link is a supporting demo, NOT the apex** — ~2% of code (1 of 7 MCP servers); never lead with "agents inhabit the running app".

When the operator changes the apex, update this section and ADR 0018 §2.7 in the same PR.

## Audience-segmented clusters (deliberate — do NOT flatten)
The same product reads differently per audience; these are kept as ONE coupled cluster each, governed for *compatibility* with the apex:

| Cluster | Lives on | Audience |
|---|---|---|
| "Application Engine for the AI Era" / Scene Graph | package.json, GitHub description, index.html, hero, llms.txt header | engineers searching npm/GitHub |
| "self-maintaining codebase / autonomous AI engineering team" | README top, repo description, ROADMAP | AI-platform / agent-infra builders (the audience that funds the comparison tools) |
| "self-evolving digital organism / Four Pillars" | VISION.md, AGENTS.md anchors, deeper learn/ docs | researchers, the swarm itself |

All three are projections of the **two-hemisphere institution apex** (§ The canonical apex). Members of a cluster must stay coherent with **each other** (don't let package.json and GitHub description diverge) and **compatible** with the apex (a narrower projection, not a contradiction). Note the audience shift the audit flagged: the README top + repo metadata should lead the AI-platform-builder cluster (institution framing), not the npm-engineer cluster — that is the §undersell re-categorization the skill propagates.

## Drift vs intentional-divergence (the escalation branch)
When a surface's framing **contradicts** the apex, classify:
- **Mechanical drift** — a stale generation that simply lags (e.g. an old tagline a newer apex superseded). → Fix toward the apex.
- **Intentional divergence** — a framing that may encode a deliberate, still-valid stance the skill can't adjudicate. → **Escalate to the operator (Tier-4); do NOT auto-rewrite.**

Worked example: `.github/VISION.md`'s "Corporate HQ / CEOs / PMs / Drones" hierarchy contradicts the Flat Peer-Team anchor. It *might* describe an intended Command-Center **product** that orchestrates sub-agents (legitimate) rather than the **maintainer-swarm topology** (which is flat). Only the operator can rule. Auto-rewriting would erase a possibly-deliberate stance.

## Claim V-B-A gate (run before shipping any framing)
Identity copy attracts superlatives. Gate every one:

| Claim type | Rule |
|---|---|
| Unbounded superlative ("fastest", "best on the market") | **Drop it** or convert to a *sufficiency* form tied to a concrete number (e.g. "fast enough to host its own AI engineering team" + the 40k figure). No "well-actually" surface. |
| Uniqueness / negative ("the only X", "first X") | Uncheckable as bare assertion. Hedge: "pioneered / still virtually alone in / we know of no other" unless a dated competitive sweep backs it. The *architecture* may be verified even when market-uniqueness isn't. |
| Numbers (version, count, 40k/sec, velocity) | Regenerate from SSOT (`references/facts-ledger.md`). Publish counts as dated-window stats. Never paste a frozen number into framing prose. |
| Anthropomorphic ("agents think / read thoughts") | Attribute to mechanism — "persisted, queryable reasoning surfaces (Memory Core)" — not sentience. |
| Client/partner/customer names | **Forbidden** on every surface. Cloud/multi-tenant = generic capability terms only. |
| Awards / external facts | Verify against an external source before public citation. |

## Why a cross-family review gate (ADR 0018 §2.6)
An identity edit is a single-author change to canonical framing — the self-authored-blind-spot risk class that cross-family review reliably catches (anchors: PRs #12146, #11999, #11962). Mandatory before merge; the human merge-gate is the backstop when only one family is active.
