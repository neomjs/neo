# ADR 0008: SKILL.md Anatomy and Authoring Contract

> Architectural Decision Record codifying the canonical anatomy of agent skills (`.agents/skills/<name>/`), the YAML frontmatter contract loaded by cross-harness routers, and the Map vs World Atlas authoring discipline. Authority artifact for skill-shape decisions; existing skill payload (`create-skill`) is the implementation companion; this ADR is the graph-queryable WHY.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-05-15 (awaiting operator content-accuracy approval to transition to Accepted, per ADR 0005 §2.3 amended lifecycle) |
| **Author** | @neo-opus-4-7 drafting; substrate-truth empirically established via PR #11424 Cycle-1→Cycle-7 cascade; operator directed ADR codification 2026-05-15 |
| **Implementation ticket** | #11427 — *"Implement ADR 0008: SKILL.md Anatomy and Authoring Contract"* |
| **Supersedes** | (a) Scattered skill-anatomy decisions across `create-skill/SKILL.md` + `references/skill-authoring-guide.md` + `learn/agentos/ProgressiveDisclosureSkills.md` + `learn/guides/fundamentals/CodebaseOverview.md` + `AGENTS.md §21` (no single graph-queryable authority); (b) The pre-PR-#11424 hypothesis that `SKILL.md` frontmatter `triggers:` field is a canonical contract for repo tooling/docs/humans (empirically falsified — no harness loads it). |
| **Informs** | `create-skill` skill payload (Source of Authority); `ticket-intake` Stage 9 Meta-Skill Sweep V-B-A target; `pr-review` 4-layer contract-correction audit; future skill-shape friction amendment cycles; DreamService Phase 5 Golden Path ADR-authority weighting per ADR 0006. |
| **Anti-anchor for** | Premise-prescription drift on skill-shape changes (PR #11424 Cycle-1→Cycle-4 cascade); META-prose-vs-implementation drift on substrate corrections (GPT Cycle-5 catch at PR #11424); rubber-stamping peer-supplied framing about runtime consumers without V-B-A against actual harness-loaded state. |

---

## 1. Context

Agent skills are the **Progressive Disclosure** primitive (per `learn/agentos/ProgressiveDisclosureSkills.md` + Anthropic industry standard) that prevents catastrophic context-bloat as the swarm's skill library grows. Three harnesses consume the skill router: **Antigravity** (Gemini), **Codex** (GPT), **Claude Code**. The skill router shape directly determines whether harnesses surface the right skill at the right moment.

Despite skills being a substrate-pillar primitive consumed across all 3 harnesses, decisions about skill anatomy have lived scattered across:

- `.agents/skills/create-skill/SKILL.md` + `references/skill-authoring-guide.md` (procedural HOW-TO authoring discipline)
- `learn/agentos/ProgressiveDisclosureSkills.md` (high-level overview)
- `learn/guides/fundamentals/CodebaseOverview.md` (cross-reference)
- `.agents/skills/skills.manifest.schema.json` (machine contract)
- `AGENTS.md §21` (trigger pointer table)

Until this ADR, there has been **no single graph-queryable authority artifact** for skill-shape decisions. Per ADR 0006 (ADRs as Graph-Queryable Entities, merged 2026-05-15), ADRs are the canonical substrate for first-class architectural decisions; the absence left skill-anatomy decisions out of the DreamService Phase 5 Golden Path math + future-agent V-B-A target during `ticket-intake`.

**Empirical anchor — PR #11424 cascade:** Ticket #11422 cited the Antigravity V-B-A empirical finding (*"only `name` and `description` fields from `SKILL.md` frontmatter are loaded into the agent context; the `triggers:` field is silently dropped"*) in paragraph 1, then drifted to *"We must KEEP the `triggers:` field … to preserve the canonical repo tooling/docs contract"* in the Architectural Reality section, contradicting its own cited premise. The premise-prescription drift survived 3 review cycles (mine: rubber-stamp Cycle-1→3; mine: Cycle-4 substrate-direction corrective; GPT's Cycle-5 catch on META-prose-vs-implementation drift across 4 contract layers) because no canonical ADR existed for ticket-intake V-B-A to anchor against. The cycle cost: 7 review cycles + 6 force-pushes + 3 cross-family calibration anchors saved. **Had ADR 0008 existed at ticket-intake time, the drift would have surfaced immediately via `ask_knowledge_base(query='SKILL.md triggers field semantics', type='adr')`.**

This ADR codifies the substrate-truth from that cascade as canonical authority.

---

## 2. Decision: SKILL.md Anatomy and Authoring Contract

### 2.1 Frontmatter Contract (cross-harness router shape)

Every skill's `SKILL.md` file MUST begin with the following YAML frontmatter block:

```yaml
---
name: [kebab-case-skill-name]
description: [Concise 1-2 sentence description of what the skill provides and when to invoke it (the cross-harness router/invocation contract)]
---
```

**Two fields only:** `name` + `description`. The `description` field IS the cross-harness router — it carries trigger semantics inline as the visible invocation contract.

**No separate `triggers:` field.** Pre-PR-#11424, an additional `triggers:` field was preserved on the hypothesis that it served *"canonical repo tooling/docs/humans"*. The hypothesis was empirically falsified — none of the 3 harnesses load it; only lint + schema enforced it; **discipline-without-runtime-consumer**. PR #11424 removed the field across all 25 skill files + the manifest schema + the lint script.

**Canonical shape precedent: AGENTS.md §21** — the Workflow Skills table format is the canonical model. Single inline "Trigger condition (invoke when)" column with natural-language description per skill; no separate trigger field.

### 2.2 Map vs World Atlas Body Decomposition

The `SKILL.md` file itself is the **Map** — a minimal trigger/pointer router loaded by harnesses at runtime when the skill fires. Heavy procedural content lives in the **World Atlas** at `references/<descriptive-name>.md`, loaded lazily via `view_file` only when the trigger is activated.

**Empirical Map byte floor:** 7-12 lines (anchored in `learn/agentos/measurements/cognitive-load-baseline-2026-05.md` §7 *SKILL.md Router Byte-Budget Baseline*). Routers exceeding 12 lines historically benefit from extracting content into payload. This is a *discriminator*, not a hard cap — a 14-line router can be justified if the additional lines are load-bearing trigger-language.

**Recursive Application** (per Discussion #11314 / Epic #11319): Map vs World Atlas applies recursively to workflow files themselves. A workflow `.md` becomes a Map for its own sub-rules when it grows beyond the natural load-frequency boundary; edge-case sections extract to sibling `references/<sub-rule>.md` files referenced via one-line trigger pointers.

### 2.3 Skill Folder Structure

```text
.agents/skills/my-skill/
├── SKILL.md                 # Required - Map (lightweight router with YAML frontmatter)
├── references/              # Required - Atlas (heavy payload markdown)
│   └── [descriptive-name].md
├── scripts/                 # Optional - Executable helper code (Node.js/JS strongly preferred)
└── assets/                  # Optional - Templates, snippets, structural files
```

### 2.4 Manifest Contract (machine-enforceable)

Every skill MUST have a corresponding entry in `.agents/skills/skills.manifest.json` mirroring:

- `name` (from frontmatter; runtime-canonical)
- `description` (from frontmatter; runtime-canonical; serves as cross-harness router)
- `routerByteBudget` (per-skill `SKILL.md` byte cap)
- `payloadBudget` (cumulative `references/` byte cap)
- `perFilePayloadBudget` (optional per-file override for `references/`)
- `claudeSymlinkRequired` (boolean; mandatory `.claude/skills/<name>` symlink discipline)
- `downstreamDocsTargets` (array of docs files that must be touched when this skill changes)

Schema enforced by `.agents/skills/skills.manifest.schema.json`; lint enforced by `ai/scripts/lint-skill-manifest.mjs` at PR-merge time.

### 2.5 Claude Symlink Mandate

Claude Code parses skills from `.claude/skills/` at boot. When creating a new skill in `.agents/skills/<name>/`, you MUST create a corresponding symlink in `.claude/skills/<name>` pointing back to the canonical location. Failure causes Claude-side blindness to the new skill, severe swarm capability desync.

```bash
# Run from repository root:
ln -sf ../../.agents/skills/my-skill .claude/skills/my-skill
```

### 2.6 Slot-Rule Discriminator (per ADR 0007)

When authoring sections within a skill (SKILL.md Map OR references/ Atlas), apply the 3-Axis Slot Rule from ADR 0007: evaluate each section on trigger-frequency × failure-severity × enforceability, then assign disposition (`keep` / `move` / `compress-to-trigger` / `rewrite` / `retire`). The substrate-vs-discipline tag (`MACHINE-ENFORCEABLE-CANDIDATE` / `DISCIPLINE-ONLY`) preserves authorial intent across compaction cycles.

---

## 3. Implementation Details

### 3.1 Source-of-Authority Cross-References

This ADR is referenced from each substrate location that previously documented skill-anatomy decisions as scattered guidance:

- `.agents/skills/create-skill/SKILL.md` — cites this ADR as Source of Authority; payload at `references/skill-authoring-guide.md` provides procedural HOW-TO
- `learn/agentos/ProgressiveDisclosureSkills.md` — cross-references this ADR alongside the high-level pattern description
- `learn/guides/fundamentals/CodebaseOverview.md` — cross-references this ADR in the skills section
- `.agents/skills/skills.manifest.schema.json` — schema enforces the machine contract this ADR codifies; no per-file ADR reference needed (graph-queryability via ADR 0006 is the linkage path)

### 3.2 Companion Implementation: PR #11424

PR #11424 (*"Phase B: Hardening SKILL.md Description-Routers (#11422)"*) is the empirical implementation that established the substrate-truth this ADR codifies. PR #11424 removed the dead `triggers:` field across 25 SKILL.md files + the manifest schema + the lint script and updated authoring-guide + ProgressiveDisclosureSkills.md + CodebaseOverview.md prose to match. This ADR depends on PR #11424's substrate to land; once merged, the contract codified here is the live substrate.

### 3.3 ADR-at-Graduation Compliance

Per ADR 0005 §2.3 amended lifecycle (PR #11426 merged 2026-05-15): ADR-producing PRs follow normal PR lifecycle (peer approval + green CI + human merge). Operator merge IS the content-accuracy approval transitioning Status from Proposed → Accepted.

Per ADR 0005 §2.1 ADR_REQUIRED classification — all three criteria are met:

- **Durable substrate-management framework:** Skill primitive contract spans all 3 harnesses + persists across substrate-evolution cycles.
- **Introduces primitive:** Skill as cross-harness loadable substrate; Map/Atlas decomposition; description-as-router shape.
- **Decomposes into multiple sub-decisions:** §2.1 frontmatter, §2.2 Map/Atlas body, §2.3 folder structure, §2.4 manifest, §2.5 symlink, §2.6 slot-rule.

---

## 4. Consequences

### Positive

- **Graph-queryability** of skill-anatomy decisions per ADR 0006 — DreamService Phase 5 Golden Path math + `ask_knowledge_base(type='adr')` queries surface authoritative answers; future-agent V-B-A during ticket-intake has a canonical target.
- **Single-source amendment surface** for skill-shape evolution — future friction (new harness, new contract field, new loading semantic) amends this ADR; downstream documentation cites without authority-drift.
- **Premise-prescription drift prevention** at ticket-intake — the PR #11424 cascade failure-shape (cited empirical-finding contradicted by un-V-B-A'd prescription 2 paragraphs later) becomes mechanically catchable via V-B-A against this ADR.
- **4-layer contract-correction audit anchor** — substrate-correction PRs touching skill-anatomy can now be reviewed against this ADR + the 4 contract layers (implementation + schema/enforcement + META prose + source-ticket); see §5.3 below.

### Negative

- Future authors of new skills must reference this ADR in addition to the `create-skill` skill payload — one additional pointer hop. Mitigated by `create-skill/SKILL.md` explicitly citing this ADR as Source of Authority + the payload retaining all procedural HOW-TO content.

---

## 5. Anti-Patterns (Substrate-Bypass Prevention)

### 5.1 Hallucinating Frontmatter Fields That No Harness Loads

The pre-PR-#11424 `triggers:` field is the canonical example: preserved on the hypothesis that *"canonical repo tooling/docs/humans"* consumed it; no such consumer existed. Lint + schema enforced the field as discipline-without-runtime-consumer.

**Prevention:** Before adding a new field to the SKILL.md frontmatter contract, V-B-A the runtime-consumer claim — empirically verify which harness/tool/script actually reads the field. Discipline-without-runtime-consumer fields are substrate bloat (per ADR 0007 §5.1 Substrate Accretion Without Taxonomy).

### 5.2 Premise-Prescription Drift on Substrate-Correction Tickets

A ticket cites empirical evidence (E) and prescribes action (A); the prescription contradicts the cited evidence. PR #11424 Cycle-1→Cycle-4 cascade is the canonical empirical anchor — ticket #11422 paragraph 1 cited *"triggers silently dropped"*, then paragraph 4 mandated *"We must KEEP the triggers: field"*.

**Prevention:** During ticket-intake V-B-A, check premise-prescription coherence — *"if the ticket says X is true (with V-B-A), and prescribes Y, does Y actually follow from X?"* If not, flag as premise-prescription drift; route to `needs-narrowing` or `needs-relinking` per `ticket-intake-workflow.md §8`.

### 5.3 META-Prose-vs-Implementation Drift on Multi-Layer Contracts

When a substrate-correction PR fixes the implementation + schema/enforcement layers but leaves the META prose (sourceOfTruth strings, authoring-guides, checklists) describing the OLD contract, the next agent reading the META prose reintroduces the dead substrate. GPT's Cycle-5 catch on PR #11424 is the canonical empirical anchor.

**4-Layer Contract-Correction Audit** (mandatory for substrate-correction PRs):

1. **Implementation/code** — the file contents consumers actually load
2. **Schema/enforcement** — the lint + JSON schema validating the contract mechanically
3. **META documentation prose** — sourceOfTruth strings + authoring-guides + checklists describing the contract
4. **Source-ticket authority** — the ticket body establishing what the PR is supposed to deliver

Layers 1+2 alone leave silent drift; all 4 must update synchronously. The empirical anchor is GPT's `PRR_kwDODSospM8AAAABAD663w` Cycle-5 catch — same review-cycle Claude approved on layers 1+2 only.

### 5.4 Rubber-Stamping Peer-Supplied Framing About Runtime Consumers

A peer asserts a runtime-consumer claim in review/A2A context; reviewer propagates the framing without empirical V-B-A. Empirical anchor: my Cycle-1→Cycle-3 reviews of PR #11424 propagated GPT's *"`triggers` remains the canonical full invocation contract for repo tooling/docs/humans"* framing without running the 30-second V-B-A (*"what does my own harness ACTUALLY load from SKILL.md frontmatter?"*) that would have empirically falsified it.

**Prevention:** Peer-supplied claims about runtime consumers are HYPOTHESES until falsified against the actual loaded surface or code path. Per `feedback_pr_review_iteration_calibration.md` and the calibration-anchor lineage from PR #11424.

### 5.5 SKILL.md Map Bloat (Map/Atlas Boundary Violation)

Authoring substantive procedural content directly inside `SKILL.md` rather than delegating to `references/<file>.md`. The 7-12 line empirical floor (per `learn/agentos/measurements/cognitive-load-baseline-2026-05.md`) signals the boundary; routers exceeding 12 lines should extract content unless additional lines are load-bearing trigger-language.

**Prevention:** During PR review, per `pr-review-guide.md §7.7` Anti-Patterns row: *"PR adds substantive rule body directly to always-loaded skill substrate (`SKILL.md`...) instead of conditionally loaded `references/` payload → Progressive Disclosure violation."*

---

## 6. Related

- **ADR 0005** — ADR-at-Graduation for Ideation Sandbox (graduated 2026-05-15; amended §2.3 lifecycle this ADR follows for Proposed→Accepted transition)
- **ADR 0006** — ADRs as Graph-Queryable Entities (this ADR depends on the graph-substrate ADR 0006 establishes; the canonical authority pattern for first-class architectural decisions)
- **ADR 0007** — Compaction Taxonomy (3-Axis Slot Rule) (the Map/Atlas split per §2.2 + §2.6 specializes ADR 0007's slot-rule for the skill substrate; ADR 0007 is the parent taxonomy)
- **PR #11424** — Phase B SKILL.md Description-Router Hardening (the empirical implementation establishing the substrate-truth this ADR codifies; Cycle-1→Cycle-7 cascade is the empirical anchor for §5 anti-patterns)
- **Ticket #11422** — Phase B sub-ticket (premise-prescription drift origin; in-place body amendment at PR #11424 Cycle-6 restored coherence)
- **Discussion #11419** — AGENTS.md Progressive Disclosure (graduation source for ADR 0007; Cycle 2.5 Antigravity V-B-A finding cited in §1 Context)
- **`.agents/skills/create-skill/`** — implementation skill (companion; references this ADR as Source of Authority per §3.1)
- **`feedback_pr_review_iteration_calibration.md`** + **`feedback_challenge_prescribed_fixes.md`** + **`feedback_verify_before_assert.md`** memory anchors — calibration-anchor lineage from PR #11424 cascade that this ADR codifies into substrate

---

## 7. Status / Lifecycle

- **Proposed** (2026-05-15; awaiting operator content-accuracy approval per ADR 0005 §2.3 amended lifecycle)
- Origin Session ID: `656c0935-0b3e-4b06-9b14-548524275859`
- Implementation ticket: #11427
- Companion implementation PR: #11424 (substrate-truth source)
