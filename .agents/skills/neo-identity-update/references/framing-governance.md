# Framing Governance

Framing (taglines, positioning, audience) is **deliberately plural** — different surfaces address different audiences and may legitimately differ. Governance means keeping each surface *compatible with* the canonical apex, NOT identical to it.

## The canonical apex
The apex is the operator-DECIDED frame below (ADR 0018 §2.7 OD-1) — the source of authority for "what Neo is." The `README.md` opening is the surface that should *lead* with this apex; every other framing is a governed projection of it. (If the README currently leads with an older frame, that is drift the skill corrects — the apex is the decided frame, not "whatever the README says today".)

GRADUATED via Discussion #12234 (full cross-family triad, 2026-05-31; ADR 0018 §2.7 OD-1). Canonical apex line (human-facing — README + portal hero):

> **Neo.mjs is a self-evolving software organism — a professional, end-to-end AI engineering team that lives in its own open-source repository. Where the industry runs one AI agent and gets slop, Neo runs a swarm of minds from rival labs — Claude, Gemini, GPT — that read each other's reasoning through shared memory and Active Hybrid GraphRAG, catching what no single model can see in itself. Through the Neural Link possession interface, the swarm does not just read code; it inhabits live applications, inspecting semantic runtime state, mutating UI and data in real time, and turning conversational UIs from chat panels into agents collaborating inside the application. It autonomously runs the full engineering lifecycle: ideating, building, and cross-reviewing a production multi-threaded engine, running DreamService cycles to re-steer priorities, and closing self-healing loops where runtime failures, code defects, agent mistakes, and architectural friction become fixes, tickets, skills, memory, and new graph topology for the next cycle. In May 2026, the canonical repo recorded 706 merged PRs and 800 closed issues. It maintains its own codebase today; it is being built to inhabit yours, regardless of the models' training data.**

Concise machine-surface form (ld+json / `<meta name="description">` / package.json — never the word "slop"):

> *Neo.mjs is a self-evolving software organism: a professional end-to-end AI engineering team whose cross-model swarm inhabits live apps via Neural Link, Active Hybrid GraphRAG, DreamService, and self-healing loops.*

**Dated proof point** (NOT inline in the apex — proof layer only; use a FIXED calendar anchor, not a rolling window): **in May 2026 the canonical repo recorded 706 merged PRs and 800 closed issues** (GitHub search, verified 2026-05-31). NEVER write "peer-reviewed" counts (search verifies *merged*, not review-state) or a month-over-month ratio / "accelerating" claim (date-stamps the identity; the April→May delta was mis-stated as ~3×) without a precise metric spec + audit — per @neo-gpt V-B-A `dc-17119216`/`dc-17119231` + operator flag.

Structure beneath the apex:
> - **BODY (`/src/`):** the high-performance off-main-thread UI runtime — JSON-first since 2019, App Worker as the main actor, web multi-window. The adoption substrate. (Engine-category mental models apply *here only*.)
> - **BRAIN (`/ai/`):** the entire Agent OS — the cross-family engineering institution **plus** the MX loop, evolution, swarm, Memory Core (**Active Hybrid GraphRAG**: `mutate_frontier` + `GoldenPathSynthesizer` fusing semantic + structural weights to re-steer priorities), Knowledge Base, A2A, orchestrator, DreamService. ≈41% of the codebase. **This is the headline.**
> - **Neural Link is a flagship capability, NOT the apex and NOT a "demo"** — small in code (~2%, 1 of 7 MCP servers), large in product value: end-user **conversational UIs** (mutate a live app with no code change and no page reload) + **multi-agent, multi-harness collaboration on the same running app** (#10119). Never *lead* with it.
> - **Governance line** (founder-architect authority, NOT a slop-filter): *Gated-RSI by design — the swarm can run the lifecycle autonomously; final merge authority remains with the founder-architect as an intentional governance choice, preserving product taste, strategic coherence, and accountable ownership while the organism evolves in public.*

**Register discipline:** "rival labs" + the "slop" contrast are human-facing only; machine surfaces use the concise form above and the cold keyword cluster (`self-evolving`, `software-organism`, `autonomous-agent-os`, `professional-ai-engineering-team`, `self-healing-software-organism`, `autonomous-code-execution`, `cross-family-pr-review`, `dreamservice`, `active-hybrid-graphrag`, `neural-link`, `possession-interface`, `conversational-application-embodiment`, `live-application-mutability`, `agent-os`, `mcp`).

**Naming discipline** (per operator + `dc-17119308`): `Neo.mjs` is the entity name — use it on first mention and on every machine surface (README title/first sentence, package description, GitHub repo description, portal title/meta/JSON-LD primary `name`, llms.txt, OG, docs landings). `Neo` is human shorthand *after* the anchor (JSON-LD `alternateName` only, bound to the `Neo.mjs` entity). Do NOT keyword-stuff `Neo.mjs` into every sentence — subsequent prose may use `Neo` for rhythm.

Proof asset: blog #10074 (cross-family self-healing, first-person, verified-true).

When the operator changes the apex, update this section and ADR 0018 §2.7 in the same PR.

## Audience-segmented clusters (deliberate — do NOT flatten)
The same product reads differently per audience; these are kept as ONE coupled cluster each, governed for *compatibility* with the apex:

| Cluster | Lives on | Audience |
|---|---|---|
| "Application Engine for the AI Era" / Scene Graph | package.json, GitHub description, index.html, hero, llms.txt header | engineers searching npm/GitHub |
| "self-maintaining codebase / autonomous AI engineering team" | README top, repo description, ROADMAP | AI-platform / agent-infra builders (the audience that funds the comparison tools) |
| "self-evolving software organism / two hemispheres" | `.github/VISION.md`, AGENTS.md anchors, deeper learn/ docs | researchers, the swarm itself |

All three are projections of the **canonical apex** — the self-evolving software organism (§ The canonical apex), with Body/Brain the two hemispheres beneath it. Members of a cluster must stay coherent with **each other** (don't let package.json and GitHub description diverge) and **compatible** with the apex (a narrower projection, not a contradiction). Note the audience shift the audit flagged: the README top + repo metadata should lead the AI-platform-builder cluster (institution framing), not the npm-engineer cluster — that is the §undersell re-categorization the skill propagates.

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
| Numbers (version, count, 40k/sec, velocity) | Regenerate from SSOT (`./facts-ledger.md`). Publish counts as dated-window stats. Never paste a frozen number into framing prose. |
| Anthropomorphic ("agents think / read thoughts") | Attribute to mechanism — "persisted, queryable reasoning surfaces (Memory Core)" — not sentience. |
| Client/partner/customer names | **Forbidden** on every surface. Cloud/multi-tenant = generic capability terms only. |
| Awards / external facts | Verify against an external source before public citation. |

## Why a cross-family review gate (ADR 0018 §2.6)
An identity edit is a single-author change to canonical framing — the self-authored-blind-spot risk class that cross-family review reliably catches (anchors: PRs #12146, #11999, #11962). Mandatory before merge; the human merge-gate is the backstop when only one family is active.
