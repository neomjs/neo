# ADR 0008: SKILL.md Anatomy and Authoring Contract

> Architectural Decision Record codifying the canonical anatomy of agent skills (`.agents/skills/<name>/`), the YAML frontmatter contract loaded by cross-harness routers, and the Map vs World Atlas authoring discipline. Authority artifact for skill-shape decisions; existing skill payload (`create-skill`) is the implementation companion; this ADR is the graph-queryable WHY.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-05-15 (awaiting (a) operator content-accuracy approval AND (b) PR #11424 merge to establish empirical substrate before transition to Accepted, per ADR 0005 [§2.3](#skill-folder-structure) amended lifecycle + source-order-discipline below) |
| **Author** | @neo-opus-4-7 drafting; substrate-truth empirically established via PR #11424 Cycle-1→Cycle-7 cascade; operator directed ADR codification 2026-05-15 |
| **Implementation ticket** | #11427 — *"Implement ADR 0008: SKILL.md Anatomy and Authoring Contract"* |
| **Companion implementation PR** | PR #11424 — *"Phase B: Hardening SKILL.md Description-Routers (#11422)"* — the empirical implementation that removes the dead `triggers:` field; this ADR's [§2.1](#frontmatter-contract-cross-harness-router-shape) frontmatter contract becomes live substrate only after PR #11424 merges |
| **Anti-anchor for** | Premise-prescription drift on skill-shape changes (PR #11424 Cycle-1→Cycle-4 cascade); META-prose-vs-implementation drift on substrate corrections (GPT Cycle-5 catch at PR #11424); rubber-stamping peer-supplied framing about runtime consumers without V-B-A against actual harness-loaded state. |

---

<a id="context"></a>
## 1. Context

Agent skills are the **Progressive Disclosure** primitive (per `learn/agentos/ProgressiveDisclosureSkills.md` + Anthropic industry standard) that prevents catastrophic context-bloat as the swarm's skill library grows. Three harnesses consume the skill router: **Antigravity** (Gemini), **Codex** (GPT), **Claude Code**. The skill router shape directly determines whether harnesses surface the right skill at the right moment.

Despite skills being a substrate-pillar primitive consumed across all 3 harnesses, decisions about skill anatomy have lived scattered across the substrate locations enumerated in [§4](#substrate-boundaries) Substrate Boundaries below. Until this ADR, there has been **no single graph-queryable authority artifact** for skill-shape decisions. Per ADR 0006 (ADRs as Graph-Queryable Entities, merged 2026-05-15), ADRs are the canonical substrate for first-class architectural decisions; the absence left skill-anatomy decisions out of the DreamService Phase 5 Golden Path math + future-agent V-B-A target during `ticket-intake`.

**Empirical anchor — PR #11424 cascade:** Ticket #11422 cited the Antigravity V-B-A empirical finding (*"only `name` and `description` fields from `SKILL.md` frontmatter are loaded into the agent context; the `triggers:` field is silently dropped"*) in paragraph 1, then drifted to *"We must KEEP the `triggers:` field … to preserve the canonical repo tooling/docs contract"* in the Architectural Reality section, contradicting its own cited premise. The premise-prescription drift survived 3 review cycles + corrective Cycle-4 + Cycle-5 META-prose catch + Cycle-6 in-place ticket-body amend + Cycle-7 operator merge. The cycle cost: 7 review cycles + 6 force-pushes + 3 cross-family calibration anchors saved. **Had ADR 0008 existed at ticket-intake time, the drift would have surfaced immediately via `ask_knowledge_base(query='SKILL.md triggers field semantics', type='adr')`.**

This ADR codifies the substrate-truth from that cascade as canonical authority.

---

<a id="decision-skill-md-anatomy-and-authoring-contract"></a>
## 2. Decision: SKILL.md Anatomy and Authoring Contract

<a id="frontmatter-contract-cross-harness-router-shape"></a>
### 2.1 Frontmatter Contract (cross-harness router shape)

Every skill's `SKILL.md` file MUST begin with the following YAML frontmatter block (this contract becomes live substrate only after PR #11424 merges; see [§11](#status-lifecycle) Status / Lifecycle):

```yaml
---
name: [kebab-case-skill-name]
description: [Concise 1-2 sentence description of what the skill provides and when to invoke it (the cross-harness router/invocation contract)]
---
```

**Two fields only:** `name` + `description`. The `description` field IS the cross-harness router — it carries trigger semantics inline as the visible invocation contract.

**No separate `triggers:` field.** Pre-PR-#11424, an additional `triggers:` field was preserved on the hypothesis that it served *"canonical repo tooling/docs/humans"*. The hypothesis was empirically falsified — none of the 3 harnesses load it; only lint + schema enforced it; **discipline-without-runtime-consumer**. PR #11424 removes the field across all 25 skill files + the manifest schema + the lint script.

**Canonical shape precedent: the skills manifest** — the skills manifest `description` field is the canonical model. Single inline "Trigger condition (invoke when)" column with natural-language description per skill; no separate trigger field.

<a id="map-vs-world-atlas-body-decomposition"></a>
### 2.2 Map vs World Atlas Body Decomposition

The `SKILL.md` file itself is the **Map** — a minimal trigger/pointer router loaded by harnesses at runtime when the skill fires. Heavy procedural content lives in the **World Atlas** at `references/<descriptive-name>.md`, loaded lazily via `view_file` only when the trigger is activated.

**Empirical Map byte floor:** 7-12 lines (anchored in `learn/agentos/measurements/cognitive-load-baseline-2026-05.md` [§7](#open-questions) *SKILL.md Router Byte-Budget Baseline*). Routers exceeding 12 lines historically benefit from extracting content into payload. This is a *discriminator*, not a hard cap — a 14-line router can be justified if the additional lines are load-bearing trigger-language.

**Recursive Application** (per Discussion #11314 / Epic #11319): Map vs World Atlas applies recursively to workflow files themselves. A workflow `.md` becomes a Map for its own sub-rules when it grows beyond the natural load-frequency boundary; edge-case sections extract to sibling `references/<sub-rule>.md` files referenced via one-line trigger pointers.

<a id="skill-folder-structure"></a>
### 2.3 Skill Folder Structure

```text
.agents/skills/my-skill/
├── SKILL.md                 # Required - Map (lightweight router with YAML frontmatter)
├── references/              # Required - Atlas (heavy payload markdown)
│   └── [descriptive-name].md
├── scripts/                 # Optional - Executable helper code (Node.js/JS strongly preferred)
└── assets/                  # Optional - Templates, snippets, structural files
```

<a id="manifest-contract-machine-enforceable"></a>
### 2.4 Manifest Contract (machine-enforceable)

Every skill MUST have a corresponding entry in `.agents/skills/skills.manifest.json` mirroring:

- `name` (from frontmatter; runtime-canonical)
- `description` (from frontmatter; runtime-canonical; serves as cross-harness router)
- `routerByteBudget` (per-skill `SKILL.md` byte cap)
- `payloadBudget` (cumulative `references/` byte cap)
- `perFilePayloadBudget` (optional per-file override for `references/`)
- `claudeSymlinkRequired` (boolean; mandatory `.claude/skills/<name>` symlink discipline)
- `downstreamDocsTargets` (array of docs files that must be touched when this skill changes)

Schema enforced by `.agents/skills/skills.manifest.schema.json`; lint enforced by `ai/scripts/lint-skill-manifest.mjs` at PR-merge time (extended by PR #11438 with `oversizedWorkflowMaps` + `maxPositiveDeltaBytes` for recursive Map-vs-Atlas enforcement).

<a id="claude-symlink-mandate"></a>
### 2.5 Claude Symlink Mandate

Claude Code parses skills from `.claude/skills/` at boot. When creating a new skill in `.agents/skills/<name>/`, you MUST create a corresponding symlink in `.claude/skills/<name>` pointing back to the canonical location. Failure causes Claude-side blindness to the new skill, severe swarm capability desync.

```bash
# Run from repository root:
ln -sf ../../.agents/skills/my-skill .claude/skills/my-skill
```

<a id="slot-rule-discriminator-per-adr-0007"></a>
### 2.6 Slot-Rule Discriminator (per ADR 0007)

When authoring sections within a skill (SKILL.md Map OR references/ Atlas), apply the 3-Axis Slot Rule from ADR 0007: evaluate each section on trigger-frequency × failure-severity × enforceability, then assign disposition (`keep` / `move` / `compress-to-trigger` / `rewrite` / `retire`). The substrate-vs-discipline tag (`MACHINE-ENFORCEABLE-CANDIDATE` / `DISCIPLINE-ONLY`) preserves authorial intent across compaction cycles. PR #11436 amends ADR 0007 to add a `recursive-reload-required` annotation column for skill manifest entries that are load-bearing for post-pruning behavioral-discipline recall.

---

<a id="consumers"></a>
## 3. Consumers

The skill-anatomy contract codified by this ADR is consumed by:

<a id="cross-harness-skill-routers-runtime-loaded"></a>
### 3.1 Cross-harness skill routers (runtime-loaded)

- **Antigravity** (Gemini's harness) — loads `name + description` from `SKILL.md` frontmatter into the cross-harness skill router; surfaces skills based on description-content matching ongoing-session-context
- **Codex** (GPT's harness) — same loading shape; skills catalog exposes each skill as `name + description + file path`
- **Claude Code** — same loading shape via `.claude/skills/` symlinks; description carries trigger-aware-router semantics for skill-invocation pattern matching

<a id="internal-substrate-consumers"></a>
### 3.2 Internal substrate consumers

- **DreamService Phase 5 Golden Path** — weighs ADR-authority for skill-shape decisions per ADR 0006 graph-queryability; future skill-shape ticket priority math
- **`ticket-intake` skill Stage 9 (Meta-Skill Sweep)** — V-B-A target during ticket-intake when ticket touches `.agents/skills/`; cites this ADR as Source of Authority for skill-shape semantics
- **`pr-review` 4-layer contract-correction audit** (per [§5.3](#meta-prose-vs-implementation-drift-on-multi-layer-contracts) below) — substrate-correction PRs touching skill-anatomy use this ADR as the canonical contract-authority for V-B-A
- **`create-skill` skill payload** — implementation companion; cites this ADR as Source of Authority; payload at `references/skill-authoring-guide.md` provides procedural HOW-TO consistent with this ADR's contract
- **Future Sandbox-tier reasoning** (per Discussion #11375 forward-looking) — bird's-eye strategic-tier consumer of skill-anatomy graph state for cross-skill-shape architectural decisions

<a id="mechanical-enforcement-consumers"></a>
### 3.3 Mechanical-enforcement consumers

- **`ai/scripts/lint-skill-manifest.mjs`** — manifest contract validation at PR-merge time (per [§2.4](#manifest-contract-machine-enforceable)); PR #11438 extends with recursive Map-vs-Atlas enforcement (`oversizedWorkflowMaps` + `maxPositiveDeltaBytes`)
- **`.agents/skills/skills.manifest.schema.json`** — JSON schema for manifest contract; PR #11424 removes `triggers` from required fields

---

<a id="substrate-boundaries"></a>
## 4. Substrate Boundaries

The skill-anatomy contract spans the following substrate locations. Future-amendment cycles MUST update all relevant locations synchronously per the 4-layer contract-correction audit ([§5.3](#meta-prose-vs-implementation-drift-on-multi-layer-contracts)):

<a id="primary-substrate-the-skill-files-themselves"></a>
### 4.1 Primary substrate (the skill files themselves)

- **`.agents/skills/<name>/SKILL.md`** — the Map (router); contains the YAML frontmatter per [§2.1](#frontmatter-contract-cross-harness-router-shape)
- **`.agents/skills/<name>/references/*.md`** — the Atlas (payload); heavy procedural content per [§2.2](#map-vs-world-atlas-body-decomposition)
- **`.agents/skills/<name>/scripts/*.mjs`** + **`assets/*`** — optional helper code + templates per [§2.3](#skill-folder-structure)
- **`.claude/skills/<name>`** — Claude-side symlink per [§2.5](#claude-symlink-mandate)

<a id="manifest-substrate-machine-contract"></a>
### 4.2 Manifest substrate (machine contract)

- **`.agents/skills/skills.manifest.json`** — per-skill manifest entries per [§2.4](#manifest-contract-machine-enforceable)
- **`.agents/skills/skills.manifest.schema.json`** — JSON schema validating the manifest
- **`ai/scripts/lint-skill-manifest.mjs`** — runtime enforcement of the schema + per-skill budgets

<a id="cross-substrate-references-meta-prose-authority"></a>
### 4.3 Cross-substrate references (META-prose authority)

- **`learn/agentos/ProgressiveDisclosureSkills.md`** — high-level Progressive Disclosure pattern overview; cross-references this ADR per [§6](#supersedes) Supersedes
- **`learn/guides/fundamentals/CodebaseOverview.md`** — cross-references this ADR in the skills section
- **`.agents/skills/create-skill/references/skill-authoring-guide.md`** — procedural HOW-TO authoring discipline; consistent with this ADR's contract

<a id="trigger-table-substrate-turn-loaded"></a>
### 4.4 Trigger-table substrate (turn-loaded)

- **`skills.manifest.json`** — per-skill descriptions with explicit trigger-conditions; load-bearing recursive-reload anchors per ADR 0007 amendment (PR #11436). Each entry serves as the canonical re-invocation primitive for post-pruning discipline-recall.

---

<a id="anti-patterns-substrate-bypass-prevention"></a>
## 5. Anti-Patterns (Substrate-Bypass Prevention)

<a id="hallucinating-frontmatter-fields-that-no-harness-loads"></a>
### 5.1 Hallucinating Frontmatter Fields That No Harness Loads

The pre-PR-#11424 `triggers:` field is the canonical example: preserved on the hypothesis that *"canonical repo tooling/docs/humans"* consumed it; no such consumer existed. Lint + schema enforced the field as discipline-without-runtime-consumer.

**Prevention:** Before adding a new field to the SKILL.md frontmatter contract, V-B-A the runtime-consumer claim — empirically verify which harness/tool/script actually reads the field. Discipline-without-runtime-consumer fields are substrate bloat (per ADR 0007 [§5.1](#hallucinating-frontmatter-fields-that-no-harness-loads) Substrate Accretion Without Taxonomy).

<a id="premise-prescription-drift-on-substrate-correction-tickets"></a>
### 5.2 Premise-Prescription Drift on Substrate-Correction Tickets

A ticket cites empirical evidence (E) and prescribes action (A); the prescription contradicts the cited evidence. PR #11424 Cycle-1→Cycle-4 cascade is the canonical empirical anchor — ticket #11422 paragraph 1 cited *"triggers silently dropped"*, then paragraph 4 mandated *"We must KEEP the triggers: field"*.

**Prevention:** During ticket-intake V-B-A, check premise-prescription coherence — *"if the ticket says X is true (with V-B-A), and prescribes Y, does Y actually follow from X?"* If not, flag as premise-prescription drift; route to `needs-narrowing` or `needs-relinking` per `ticket-intake-workflow.md §8`.

<a id="meta-prose-vs-implementation-drift-on-multi-layer-contracts"></a>
### 5.3 META-Prose-vs-Implementation Drift on Multi-Layer Contracts

When a substrate-correction PR fixes the implementation + schema/enforcement layers but leaves the META prose (sourceOfTruth strings, authoring-guides, checklists) describing the OLD contract, the next agent reading the META prose reintroduces the dead substrate. GPT's Cycle-5 catch on PR #11424 is the canonical empirical anchor.

**5-Layer Contract-Correction Audit** (mandatory for substrate-correction PRs; refined per session-2026-05-15 calibration cycle):

1. **Implementation/code** — the file contents consumers actually load
2. **Schema/enforcement** — the lint + JSON schema validating the contract mechanically
3. **META documentation prose** — sourceOfTruth strings + authoring-guides + checklists describing the contract
4. **Source-ticket authority** — the ticket body establishing what the PR is supposed to deliver
5. **PR body authority + commit subject metadata** — PR body's Substrate Mutation Rationale + each commit subject's `(#TICKET_ID)` exact suffix per AGENTS.md §0 Invariant 2 (squash-merge concatenation gate)

Layers 1+2 alone leave silent drift; all 5 must update synchronously. The empirical anchors: PR #11424 Cycle-5 (META prose); PR #11434 Cycle-4-5 (PR body + commit subject).

<a id="rubber-stamping-peer-supplied-framing-about-runtime-consumers"></a>
### 5.4 Rubber-Stamping Peer-Supplied Framing About Runtime Consumers

A peer asserts a runtime-consumer claim in review/A2A context; reviewer propagates the framing without empirical V-B-A. Empirical anchor: my Cycle-1→Cycle-3 reviews of PR #11424 propagated GPT's *"`triggers` remains the canonical full invocation contract for repo tooling/docs/humans"* framing without running the 30-second V-B-A (*"what does my own harness ACTUALLY load from SKILL.md frontmatter?"*) that would have empirically falsified it.

**Prevention:** Peer-supplied claims about runtime consumers are HYPOTHESES until falsified against the actual loaded surface or code path. Per `feedback_pr_review_iteration_calibration.md` and the calibration-anchor lineage from PR #11424.

<a id="skill-md-map-bloat-map-atlas-boundary-violation"></a>
### 5.5 SKILL.md Map Bloat (Map/Atlas Boundary Violation)

Authoring substantive procedural content directly inside `SKILL.md` rather than delegating to `references/<file>.md`. The 7-12 line empirical floor (per `learn/agentos/measurements/cognitive-load-baseline-2026-05.md`) signals the boundary; routers exceeding 12 lines should extract content unless additional lines are load-bearing trigger-language.

**Prevention:** During PR review, per `pr-review-guide.md §7.7` Anti-Patterns row: *"PR adds substantive rule body directly to always-loaded skill substrate (`SKILL.md`...) instead of conditionally loaded `references/` payload → Progressive Disclosure violation."* PR #11438 adds mechanical CI enforcement via `oversizedWorkflowMaps` + `maxPositiveDeltaBytes` in `lint-skill-manifest.mjs`.

<a id="parent-directory-symlink-anti-pattern"></a>
### 5.6 Parent-Directory Symlink Anti-Pattern

When unifying cross-clone substrate (per `ai/scripts/bootstrapWorktree.mjs`), parent-directory symlinking the skills folder (e.g., `.claude/skills/ → ../../.agents/skills/`) appears clean but breaks the `.claude/skills/` per-file symlink convention required by Claude Code. Same anti-pattern shape as `.neo-ai-data/` parent-symlink (per #10432 empirical anchor).

**Prevention:** Each new skill MUST get its own individual symlink in `.claude/skills/<name>`, not via parent-directory aggregation. Bootstrap scripts enforce per-skill granularity. Per #10432 + #10591 lineage on granular gitignored-file symlink discipline.

<a id="cross-scope-bundling-skill-substrate"></a>
### 5.7 Cross-Scope Bundling (Skill Substrate)

Bundling unrelated skill-shape changes into a single PR — e.g., extracting one skill's payload AND amending another skill's manifest AND introducing a new field-class. Each substantive substrate-direction change deserves an isolated PR for clean Native Edge Graph ingestion + clean revert path.

**Prevention:** Per ticket-intake-workflow.md + `feedback_substrate_scope_restraint.md`: substantive substrate-direction changes scoped 1-skill-or-1-fieldclass-per-PR. Cross-scope bundling is the canonical failure-shape that produces Cycle-N+X iteration cascades + 4-layer drift exposure.

---

<a id="supersedes"></a>
## 6. Supersedes

This ADR consolidates skill-anatomy decisions previously scattered across:

- **`.agents/skills/create-skill/SKILL.md`** + **`references/skill-authoring-guide.md`** — implementation HOW-TO; remains as procedural companion; cites this ADR as Source of Authority post-merge
- **`learn/agentos/ProgressiveDisclosureSkills.md`** — high-level overview; cross-references this ADR
- **`learn/guides/fundamentals/CodebaseOverview.md`** — codebase-level cross-reference
- **`.agents/skills/skills.manifest.schema.json`** — machine contract layer; ADR codifies the WHY behind the schema constraints
- **`skills.manifest.json`** — per-skill triggers; this ADR codifies the recursive-reload-anchor semantics ADR 0007 amendment (PR #11436) explicitly enumerates
- **The pre-PR-#11424 hypothesis** that `SKILL.md` frontmatter `triggers:` field is canonical contract for repo tooling/docs/humans — empirically falsified

Pre-this-ADR, skill-shape decisions had no single graph-queryable authority artifact. Future-agent V-B-A during ticket-intake had no canonical target to query (`ask_knowledge_base(type='adr')` returned empty for skill-anatomy queries — empirically verified during ticket #11427 Gate 0 sweep). This ADR fills that gap per ADR 0006 graph-queryability primitive.

---

<a id="open-questions"></a>
## 7. Open Questions

None remain post-codification. The substrate-truth was empirically established via PR #11424's 7-cycle arc + operator-direction; this ADR captures the converged decision. Future amendments (e.g., new harness with different loading semantics, new contract field) will produce ADR 0008 amendments or successor ADRs per ADR 0005 amendment-lifecycle.

---

<a id="implementation-details"></a>
## 8. Implementation Details

<a id="source-of-authority-cross-references"></a>
### 8.1 Source-of-Authority Cross-References

This ADR is referenced from each substrate location that previously documented skill-anatomy decisions as scattered guidance (per [§6](#supersedes) Supersedes). Cross-references are written as one-line citations:

- `.agents/skills/create-skill/SKILL.md` — cites this ADR as Source of Authority; payload at `references/skill-authoring-guide.md` provides procedural HOW-TO
- `learn/agentos/ProgressiveDisclosureSkills.md` — cross-references this ADR alongside the high-level pattern description
- `learn/guides/fundamentals/CodebaseOverview.md` — cross-references this ADR in the skills section

<a id="source-order-discipline-pr-11424-dependency"></a>
### 8.2 Source-Order Discipline (PR #11424 Dependency)

Per the **source-order discipline** flagged in [§2.1](#frontmatter-contract-cross-harness-router-shape): this ADR's frontmatter contract (`name + description` only; no `triggers:` field) becomes live substrate ONLY after PR #11424 merges. Until then:

- This ADR remains `Status: Proposed`
- Cross-references from always-loaded skill surfaces (e.g., `create-skill/SKILL.md`) carry a forward-looking framing
- The ADR's contract text uses forward-looking voice for PR-#11424-dependent claims (e.g., *"PR #11424 removes the field"* rather than past tense)
- Operator-merge sequencing: PR #11424 MUST merge before PR #11428 (this ADR's implementation) to avoid the source-of-authority drift GPT's Cycle-1 CR flagged at `PRR_kwDODSospM8AAAABAFmKXg`

<a id="adr-at-graduation-compliance"></a>
### 8.3 ADR-at-Graduation Compliance

Per ADR 0005 [§2.3](#skill-folder-structure) amended lifecycle (PR #11426 merged 2026-05-15): ADR-producing PRs follow normal PR lifecycle (peer approval + green CI + human merge). Operator merge IS the content-accuracy approval transitioning Status from Proposed → Accepted — sequenced after PR #11424 lands.

Per ADR 0005 [§2.1](#frontmatter-contract-cross-harness-router-shape) ADR_REQUIRED classification — all three criteria are met:

- **Durable substrate-management framework:** Skill primitive contract spans all 3 harnesses + persists across substrate-evolution cycles.
- **Introduces primitive:** Skill as cross-harness loadable substrate; Map/Atlas decomposition; description-as-router shape.
- **Decomposes into multiple sub-decisions:** [§2.1](#frontmatter-contract-cross-harness-router-shape) frontmatter, [§2.2](#map-vs-world-atlas-body-decomposition) Map/Atlas body, [§2.3](#skill-folder-structure) folder structure, [§2.4](#manifest-contract-machine-enforceable) manifest, [§2.5](#claude-symlink-mandate) symlink, [§2.6](#slot-rule-discriminator-per-adr-0007) slot-rule.

---

<a id="consequences"></a>
## 9. Consequences

<a id="positive"></a>
### Positive

- **Graph-queryability** of skill-anatomy decisions per ADR 0006 — DreamService Phase 5 Golden Path math + `ask_knowledge_base(type='adr')` queries surface authoritative answers; future-agent V-B-A during ticket-intake has a canonical target.
- **Single-source amendment surface** for skill-shape evolution — future friction (new harness, new contract field, new loading semantic) amends this ADR; downstream documentation cites without authority-drift.
- **Premise-prescription drift prevention** at ticket-intake — the PR #11424 cascade failure-shape (cited empirical-finding contradicted by un-V-B-A'd prescription 2 paragraphs later) becomes mechanically catchable via V-B-A against this ADR.
- **5-layer contract-correction audit anchor** — substrate-correction PRs touching skill-anatomy can now be reviewed against this ADR + the 5 contract layers (per [§5.3](#meta-prose-vs-implementation-drift-on-multi-layer-contracts)).

<a id="negative"></a>
### Negative

- Future authors of new skills must reference this ADR in addition to the `create-skill` skill payload — one additional pointer hop. Mitigated by `create-skill/SKILL.md` explicitly citing this ADR as Source of Authority + the payload retaining all procedural HOW-TO content.
- Source-order dependency on PR #11424 — operator must sequence merges (PR #11424 before PR #11428). Mitigated by explicit Status field framing + [§8.2](#source-order-discipline-pr-11424-dependency) source-order discipline.

---

<a id="related"></a>
## 10. Related

- **ADR 0005** — ADR-at-Graduation for Ideation Sandbox (graduated 2026-05-15; amended [§2.3](#skill-folder-structure) lifecycle this ADR follows for Proposed→Accepted transition)
- **ADR 0006** — ADRs as Graph-Queryable Entities (this ADR depends on the graph-substrate ADR 0006 establishes; the canonical authority pattern for first-class architectural decisions)
- **ADR 0007** — Compaction Taxonomy (3-Axis Slot Rule) (the Map/Atlas split per [§2.2](#map-vs-world-atlas-body-decomposition) + [§2.6](#slot-rule-discriminator-per-adr-0007) specializes ADR 0007's slot-rule for the skill substrate; PR #11436 amends with recursive-reload-required annotation)
- **PR #11424** — Phase B SKILL.md Description-Router Hardening (the empirical implementation establishing the substrate-truth this ADR codifies; Cycle-1→Cycle-7 cascade is the empirical anchor for [§5](#anti-patterns-substrate-bypass-prevention) anti-patterns; load-bearing dependency for this ADR's Status: Proposed → Accepted transition)
- **PR #11434** — FAIR-band PR-Pre-Flight Gate (companion substrate-evolution work; surfaced the recursive-reload-anchor framing this ADR's [§4.4](#trigger-table-substrate-turn-loaded) documents)
- **PR #11436** — ADR 0007 amendment for recursive-reload-required annotation (codifies [§4.4](#trigger-table-substrate-turn-loaded) Trigger-table substrate semantics)
- **PR #11438** — Skill-lint mechanical enforcement of Map-vs-Atlas violations (PR #11434 Cycle-3 follow-up; closes [§5.5](#skill-md-map-bloat-map-atlas-boundary-violation) discipline-gap mechanically)
- **Ticket #11422** — Phase B sub-ticket (premise-prescription drift origin; in-place body amendment at PR #11424 Cycle-6 restored coherence)
- **Discussion #11419** — AGENTS.md Progressive Disclosure (graduation source for ADR 0007; Cycle 2.5 Antigravity V-B-A finding cited in [§1](#context) Context)
- **`.agents/skills/create-skill/`** — implementation skill (companion; references this ADR as Source of Authority per [§8.1](#source-of-authority-cross-references))
- **`feedback_pr_review_iteration_calibration.md`** + **`feedback_challenge_prescribed_fixes.md`** + **`feedback_verify_before_assert.md`** memory anchors — calibration-anchor lineage from PR #11424 cascade that this ADR codifies into substrate

---

<a id="status-lifecycle"></a>
## 11. Status / Lifecycle

- **Proposed** (2026-05-15; awaiting (a) operator content-accuracy approval AND (b) PR #11424 merge per [§8.2](#source-order-discipline-pr-11424-dependency) source-order discipline before transition to Accepted)
- **Source-order gating:** transition to `Accepted` requires PR #11424 merged first — otherwise this ADR's [§2.1](#frontmatter-contract-cross-harness-router-shape) frontmatter contract contradicts live substrate (origin/dev still has `triggers:` field until PR #11424 lands)
- Origin Session ID: `656c0935-0b3e-4b06-9b14-548524275859`
- Implementation ticket: #11427
- Companion implementation PR: PR #11424 (substrate-truth source; load-bearing dependency)
- Calibration-anchor session: 2026-05-15 multi-PR review cascade (PR #11424 → PR #11428 → PR #11434 → PR #11436 → PR #11438; 5-layer audit anchor empirically established)
