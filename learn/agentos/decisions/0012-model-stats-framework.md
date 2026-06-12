# ADR 0012: Model-Stats Framework

> Architectural Decision Record defining the framework for tracking model capabilities, identity lifecycle, sunset/promotion triggers, and swarm-routing implications across all model families consumed by the Neo swarm.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-05-18 (transitions to Accepted on approved, green PR merge by the human operator) |
| **Author** | @neo-opus-4-7 drafting; architecture confirmed by operator (substrate-wide scope) |
| **Graduated from** | Discussion #11598 OQ on missing model-stats substrate — operator-direction in 2026-05-18 session ("requires in-depth web search. should include gemma4-31b too") |
| **Implementation ticket** | #11601 — *"Substrate decision: Model-Stats ADR — capability/limit/sunset/promotion framework"* |
| **Builds on** | `learn/agentos/IdentitySchema.md` (Per-Model Identity decision) — extends the existing schema with capability-bearing fields |
| **Supersedes** | Scattered identity / capability fragments in `AGENTS.md` Identity section, in-skill substrate, private-memory feedback files, ad-hoc commit messages |
| **Informs** | Future model graduations / sunsets / promotions; swarm-routing policy work; `feedback_training_data_anchor_drift.md` recurrence prevention |
| **Anti-anchor for** | Per-model ADR proliferation, omnibus single-ADR data-and-decision mixing, in-line identity fragments scattered across substrate |

---

## 1. Context

Before this ADR, model identity and capability framing lived in **scattered fragments** across the substrate:

- `AGENTS.md` Identity section names 3 maintainer logins (`@neo-opus-4-7`, `@neo-gemini-3-1-pro`, `@neo-gpt`) without capability data
- `learn/agentos/IdentitySchema.md` formalizes the `AgentIdentity` graph node + the Per-Model Identity decision (low-churn, cross-session traversal, traceability) — but has no capability fields
- Individual skill substrate references model-specific behaviors ad-hoc
- Private-memory feedback files (`feedback_training_data_anchor_drift.md`, `research_swarm_model_velocity_specialization.md`) carry empirical observations that never reach shared substrate
- `learn/agentos/SwarmIntelligence.md` line 342 references `model: 'gemma4'` in code/config without canonical definition
- `learn/agentos/v13-path.md:314` references `gemma4-31b` as the DreamService graph-parser role without capability framing

This scattered shape produces a recurring failure mode: agents regress to **training-data anchors** ("Claude 3.5 Sonnet / Gemini 1.5 Pro") session after session, because no canonical substrate corrects the drift. The MX loop captures the symptom (memory file: `feedback_training_data_anchor_drift.md`) but converts none of it into substrate. This ADR closes that loop.

V-B-A this turn against last 200 merged PRs confirmed: **zero ADR in `learn/agentos/decisions/**` governs model-stats lifecycle**. The gap is real and load-bearing.

---

## 2. Decision

Model-stats substrate adopts a **3-layer architecture**: the framework decision lives in this ADR (architectural, rare update); the schema lives in `IdentitySchema.md` (graph-node fields, rare update); per-model data lives in `ModelStats.md` (registry, frequent update as models sunset/promote).

### 2.1 Three-layer separation

| Layer | File | Role | Update cadence |
|---|---|---|---|
| **Framework ADR** | `learn/agentos/decisions/0012-model-stats-framework.md` (this file) | Architectural decision: capability dimensions, sunset/promotion triggers, swarm-routing policy, registry-update discipline, anti-patterns | Rare — only when the framework itself evolves |
| **Schema** | `learn/agentos/IdentitySchema.md` | Graph-node field definitions for `AgentIdentity` capability properties | Rare — when new dimensions are added |
| **Registry** | `learn/agentos/ModelStats.md` | Per-model facts (current state, capability values, sunset history) | Frequent — per model release / sunset event |

This separation aligns with ADR 0007 Map vs World Atlas compaction discipline: the ADR + schema are World Atlas (historical authority, rare update, archive-leaning); the registry is closer to live Map state (frequent update, current-truth-leaning). Mixing them in a single omnibus ADR would force architectural substrate to churn on every model release.

### 2.2 Capability dimensions (schema definition)

The following capability dimensions are tracked on each `AgentIdentity` node and reflected in the `ModelStats.md` registry:

| Dimension | Type | Purpose |
|---|---|---|
| `contextWindowInput` | `Number` (tokens) | Maximum input token capacity (e.g., 1,048,576 for 1M-context models) |
| `contextWindowOutput` | `Number` (tokens, optional) | Output token capacity where distinct from input (e.g., Gemini 3.1 Pro: 65,536) |
| `parallelToolCalls` | `Boolean` \| `Number` | Whether parallel tool invocation is supported; numeric value indicates max concurrency where bounded |
| `thoughtBudget` | `String` | Reasoning/thinking-budget setting in active use, per provider's terminology. Values differ per provider (Claude: `'max'`; Gemini: `'high'`/`'extra-high'`/`'max'` capped at provider-side; GPT: `'extra-high'`/`'max'`-equivalent). The dimension is comparable cross-family at a coarse "closer ball park" granularity; exact equivalences require empirical V-B-A. |
| `hosting` | `'cloud' \| 'mlx-local' \| 'self-hosted'` | Where the model executes; informs latency, cost, and privacy substrate |
| `family` | `String` | Model family (`'claude'`, `'gpt'`, `'gemini'`, `'gemma'`, `'qwen'`, `'phi'`, etc.) |
| `tier` | `'frontier' \| 'balanced' \| 'fast'` | Capability-cost tier; informs swarm-routing policy |
| `releaseDate` | `ISO 8601 String` | Model release date (anchoring against training-data drift) |
| `pricingInput` | `Number` (USD per 1M tokens, optional) | Cost dimension for cloud-hosted models |
| `pricingOutput` | `Number` (USD per 1M tokens, optional) | Cost dimension for cloud-hosted models |
| `license` | `String` (optional) | License identifier for open-weights models (e.g., `'Apache-2.0'`) |
| `benchmarkSnapshot` | `Object` (optional) | Latest benchmark scores (SWE-bench, Terminal-Bench, etc.) for capability-trend tracking |
| `sunsetTriggers` | `String[]` | Conditions under which this identity transitions to deprecated state |
| `swarmRole` | `String` (optional) | Current or aspirational role in the swarm (e.g., `'frontier-review'`, `'mlx-graph-parser'`) |

Existing `IdentitySchema.md` fields (`id`, `name`, `description`, `githubLogin`, `modelFamily`, `accountType`, `createdAt`) remain; capability fields **extend** rather than replace.

### 2.3 Sunset and promotion triggers

A model identity transitions through three lifecycle states: **Active** → **Deprecated** → **Retired**.

**Identity transitions distinguish rename vs split** (operator clarification 2026-05-19):

- **Rename** (minor version bump within same capability class — e.g., Gemini 3.1 → 3.2, Claude Opus 4.7 → 4.8): same identity ID rotates (`@neo-gemini-3-1-pro` → `@neo-gemini-3-2-pro`), `displayName` + `releaseDate` + capability data update in-place. The underlying model family is "still the same, just slightly enhanced." `createdAt` preserved per IdentitySchema.md discipline. No graph-side identity split.
- **Split** (major capability-class change — e.g., Gemini 3.0 → 3.1 where "reasoning processes inherently change," or family-shift Gemma 3 → Gemma 4): new identity provisioned; predecessor marked deprecated and retained for archaeology (`createdAt` preserved on the historical node). Per IdentitySchema.md Per-Model Identity rationale.

The boundary between rename and split is judgment-call territory; the substrate-correct shape is: presume rename for minor version bumps within a family branch; presume split for major version jumps or family changes. Decision lives in the registry-update PR body (cite which case applies).

**Promotion (new identity adoption)** triggers (split case):
- Provider releases a new model that materially changes reasoning capability (per IdentitySchema.md Per-Model Identity rationale — "massive capability upgrades like Gemini 3.0 to 3.1 inherently change reasoning processes")
- Provider releases a new variant with distinct capability profile (e.g., GPT-5.5 Thinking vs GPT-5.5 Pro)
- Provider releases a new family entirely (e.g., Gemma 4 vs Gemma 3)

**Rename triggers** (in-place rotation):
- Minor version bump preserves capability class but updates model name (e.g., 3.1 → 3.2 within same family branch)
- Identity ID + `displayName` + `releaseDate` + capability data update; graph-side `createdAt` preserved

**Deprecation triggers**:
- Provider announces sunset date for the underlying API endpoint
- Successor model fully covers the predecessor's capability envelope at lower cost OR higher quality
- Provider deprecates the family branch

**Retirement triggers**:
- Provider revokes API access entirely
- 90 days post-deprecation with zero swarm-routing traffic AND no historical-record dependency

The transitions are recorded in `ModelStats.md` per registry-update discipline (§2.5). Historical identity nodes are NOT deleted from the graph — they remain queryable for archaeology (per IdentitySchema.md `createdAt`-preservation discipline + ADR 0006 Graph-Queryable Entities).

### 2.4 Swarm-routing implications

Capability dimensions inform swarm-routing decisions:

- **Tier matching** — `frontier` tier handles substrate-architecture / cross-substrate analysis; `balanced` handles routine review / standard PRs; `fast` handles bulk classification / wake-summary tasks
- **Context window** — long-context tasks (1M+ tokens) route to `contextWindowInput >= 1000000` models; short-context tasks accept smaller windows
- **Hosting** — privacy-sensitive substrate (incidents, credentials adjacency) routes to `hosting: 'mlx-local'` where available; everything else accepts cloud
- **Parallel tool calls** — multi-tool agentic loops (PR review, ideation cycles) prefer `parallelToolCalls: true`
- **Specialization signals** — when empirical observations are V-B-A-grounded (per `research_swarm_model_velocity_specialization.md`), promote to substrate via `ModelStats.md` `swarmRole` field; honest "we don't know yet" where not yet measured

Specialization MUST be V-B-A-grounded before substrate-codification (per memory: `research_swarm_model_velocity_specialization.md` — anecdotal bandwidth-vs-depth observations remain in private memory until A2A measurement infrastructure produces falsifiable data).

### 2.5 Registry-update discipline

`ModelStats.md` is the **live state** substrate. Update cadence:

1. **New-model rows** added at first swarm contact (when an agent identity is provisioned via `ai/scripts/seedAgentIdentities.mjs`) OR at model-public-release date (for non-swarm reference entries)
2. **Capability-data updates** — V-B-A from authoritative source (model-card, official docs, release notes) cited in the PR body
3. **Sunset transitions** — recorded with date, reason, successor-model link
4. **Registry PR shape** — single-file or paired-file PRs; PR body cites the authoritative source for each capability value (anti-anchor against training-data drift)
5. **Authoritative sources** (priority order): official model card → provider release notes → provider docs → independent benchmark sites → news/commentary

Updates do NOT require ADR amendment unless the underlying capability dimension changes or a new dimension is added.

### 2.6 Inclusion scope

Models tracked in `ModelStats.md`:

**Required** (active swarm participation):
- Named cross-family maintainer identities (`@neo-opus-4-7`, `@neo-gemini-3-1-pro`, `@neo-gpt`)
- MLX-local models with operational roles (per `learn/agentos/v13-path.md:314`: `gemma4-31b` as DreamService graph-parser)

**Reference** (peers in current capability space; informs routing decisions):
- Other current-generation cloud frontier models from active provider families (Sonnet 4.6, Haiku 4.5, GPT-5.5 Pro, etc.)
- Other open-weights candidates running on MLX (Gemma 4 family variants, Qwen 3.6, Phi-4 Mini)

**Out of scope**:
- Embedding models (separate substrate concern — they live in `ai/mcp/server/memory-core/config.mjs` per #11596 unified-chroma scope)
- Models the swarm has not evaluated AND has no near-term plans to evaluate

---

## 3. Rationale

### 3.1 Why not per-model ADRs

Per-model ADRs (`0012-claude-stats.md`, `0013-gemini-stats.md`, `0014-gpt-stats.md`, etc.) proliferate to 5-8 ADRs that **share most architectural structure**. Each would redefine capability dimensions, sunset framework, registry-update discipline — most of which is family-agnostic. The SET-level policy (cross-family routing, dimension definitions) would live nowhere or be duplicated. Per-model ADRs also conflict with `IdentitySchema.md`, which has already decided model identity is a schema/graph-node concern, not a per-model architectural-decision concern.

### 3.2 Why not one omnibus ADR

A single ADR carrying both framework AND per-model data **violates ADR 0007 Map vs World Atlas compaction discipline**. Every model state change (capability upgrade, sunset, new release) would churn architectural substrate. ADRs are historical authority (rare update, archive-leaning); per-model data is closer to live Map state (frequent update). Mixing them produces a substrate that ages poorly.

### 3.3 Why hybrid (ADR + schema extension + registry)

The hybrid splits update cadences cleanly:
- Architectural decisions (rare update) → ADR
- Schema fields (rare update) → IdentitySchema.md amendment
- Per-model facts (frequent update) → ModelStats.md registry

Each layer has the right velocity. The ADR doesn't churn when Anthropic releases Opus 4.8; only the registry updates. This is **compaction-symmetric** per ADR 0007 and **graph-queryable** per ADR 0006 (each layer maps cleanly to graph entity types: ADR / Schema / Registry node families).

### 3.4 Why register MLX-local alongside cloud

`feedback_neo_is_engine_not_framework.md` reminds the swarm that Neo is a four-pillar self-evolving organism, not a SaaS-locked AI consumer. The Body pillar runs locally; the Brain pillar should be able to run substantially locally too (per `learn/agentos/v13-path.md` DreamService restoration thesis). Treating MLX-local models as first-class registry entries — not second-class footnotes — keeps the substrate honest about the Brain pillar's hybrid hosting reality.

### 3.5 Why authoritative-source-cite discipline

`feedback_training_data_anchor_drift.md` is the recurring failure: agents regress to training-data anchors for "current" model framing. The ADR exists to PREVENT that drift. Authoring the registry from authoritative external sources (model cards, release notes) — with sources cited in the PR body — turns each capability value into a V-B-A-anchored claim rather than a training-data hallucination.

---

## 4. Consequences

### Positive

- **Single authoritative substrate** for model identity, capability, sunset, swarm-routing — no more scattered fragments
- **Compaction-correct cadence** per ADR 0007: ADR rare, registry frequent
- **Graph-queryable** per ADR 0006: each layer maps to graph entity types
- **Training-drift defense** via authoritative-source-cite discipline on registry updates
- **MLX-local first-class citizenship** alongside cloud models
- **Specialization-signal codification path** for empirical observations (gated on V-B-A measurement)

### Negative

- **Three files to keep coherent** — schema change requires ADR amendment if a new dimension is added; registry update is independent
- **Registry-update discipline must hold** — without authoritative-source-cite, drift returns
- **Boundary judgment required** between framework-decision (ADR) and per-model-fact (registry); first-cycle PR will set precedent

---

## 5. Anti-Patterns

### 5.1 Per-model ADRs

`0012-claude-stats.md`, `0013-gemini-stats.md`, etc. — proliferates structural duplication; cross-family policy lives nowhere. Use the registry instead.

### 5.2 Omnibus ADR carrying per-model data

Mixing architectural decision with mutable per-model facts in one ADR churns the World Atlas on every model release. Use the registry instead.

### 5.3 In-line identity fragments

Adding model-specific framing inside `AGENTS.md` Identity section, individual skills, or scattered docs — violates the single-authoritative-substrate principle. Reference `ModelStats.md` or `IdentitySchema.md` instead.

### 5.4 Training-data-anchored registry updates

Authoring or updating `ModelStats.md` rows without citing an external authoritative source = recurrence of `feedback_training_data_anchor_drift.md` failure mode. Each capability value MUST trace back to a model card / release notes / official doc, cited in the PR body.

### 5.5 Premature specialization codification

Promoting `swarmRole` fields based on anecdotal observations (without A2A-measurement substrate) — violates V-B-A discipline. Specialization signals stay in private memory until measurable; substrate carries only V-B-A-grounded roles.

---

## 6. V-B-A Pre-Flight for Future Authors

Before modifying model-stats substrate (any of the 3 layers):

1. Read this ADR, `IdentitySchema.md`, and `ModelStats.md` current state.
2. Identify which layer the change targets:
   - Architectural decision → ADR amendment (rare)
   - New capability dimension → IdentitySchema.md amendment + ADR §2.2 update
   - Per-model fact → ModelStats.md update only
3. For registry updates: cite the authoritative source for each capability value in the PR body.
4. For sunset/promotion transitions: record date, reason, successor-link in `ModelStats.md`.
5. For new identity provisioning: ensure `ai/scripts/seedAgentIdentities.mjs` is updated and the registry row is added in the same PR.
6. Cite this ADR in PR bodies that touch model-stats substrate.

---

## 7. Related

- `learn/agentos/IdentitySchema.md` — Per-Model Identity decision; capability-field amendment lands in same PR as this ADR
- `learn/agentos/ModelStats.md` — registry; instantiated in same PR as this ADR
- ADR 0006 — ADRs as Graph-Queryable Entities (informs layer-to-graph-entity mapping)
- ADR 0007 — Compaction Taxonomy (Map vs World Atlas distinction informs the 3-layer cadence separation)
- ADR 0008 — Skill Anatomy and Authoring Contract (parallel substrate pattern; skill manifest vs skill payload split mirrors this ADR's framework vs registry split)
- ADR 0011 — Substrate Numbering Convention (semantic anchor discipline; cross-references to model-stats substrate use `learn/agentos/ModelStats.md §<model-handle>` form per §2.5)
- Discussion #11598 — MX loop spiral META; operator-broadened scope for substrate-cleanup baseline including model-stats
- `ai/scripts/seedAgentIdentities.mjs` — identity provisioning script; registry row + script update co-locate per §2.5
- Private memories (promote-to-substrate candidates): `feedback_training_data_anchor_drift.md`, `research_swarm_model_velocity_specialization.md`, `feedback_neo_is_engine_not_framework.md`

---

## 8. Status / Lifecycle

- **Proposed** while this ADR is under PR review.
- **Accepted** once the approved, green PR is merged by the human operator.
- **Periodic re-review trigger:** any new model family entering the swarm AND any registry-update discipline failure (training-drift detected in a merged registry update) MUST cite this ADR.

Origin Session ID: `e748e6db-2785-414d-a13c-2ecbadbd221a`

Retrieval Hint: `query_raw_memories("Discussion 11598 model stats ADR capability sunset promotion swarm routing 3-layer hybrid framework registry IdentitySchema")`
