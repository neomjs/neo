# Skill Authoring Guide (Progressive Disclosure)

The AI Assistant utilizes a **Progressive Disclosure** architecture for importing skills. This is an industry-standard pattern to prevent the system prompt from suffering catastrophic context-bloat when the skill library grows.

You must **NEVER** write the entire instruction manual of a skill directly into the `SKILL.md` file.

## Core Concepts

1. **The Router (`SKILL.md`):** This file is loaded into the agent's system prompt at boot time. It MUST be extremely lightweight and serves only as a set of rules for *when* the agent should invoke the skill, and *where* to find the heavy payload.
2. **The Payload (`references/*.md`):** This is the heavy documentation, playbooks, or reference code. It is NOT loaded into the system prompt. The agent reads this dynamically at runtime using the `view_file` tool *only* when the trigger is activated.

## Skill Folder Structure

Whenever you create a new skill named `my-new-skill`, you must scaffold the following standard directory structure:

```text
.agents/skills/my-new-skill/
├── SKILL.md                 # Required - Main lightweight router with YAML frontmatter
├── references/              # Required - Documentation and heavy payload markdown files
│   └── [descriptive-payload-name].md
├── scripts/                 # Optional - Executable helper code
│   ├── validate.mjs         # Example (Node.js/JS is STRONGLY PREFERRED in the Neo.mjs realm)
│   └── setup.sh             # Example (Bash is acceptable for simple environment tasks)
└── assets/                  # Optional - Templates, images, or seed data
    └── report-template.md   # Example
```

After adding or renaming a skill folder, update `.agents/skills/skills.manifest.json`. `SKILL.md` frontmatter remains the runtime source of truth; the manifest mirrors `name` and `description` for tooling, declares the router/payload budgets, and records harness/doc governance such as Claude symlink requirements and downstream documentation targets.

## Slot-Rule Discriminator (Apply Before Authoring)

Progressive Disclosure tells you *where* content goes (Router vs Payload). It doesn't tell you *which sections earn their slot* in the first place. Cycle-1 of the cognitive-load epic (#10733) surfaced a richer discriminator that you should apply before drafting any new section: the **3-axis slot rule**, the **disposition taxonomy**, and **substrate-vs-discipline tagging**.

These are guidance, not mechanical gates. Apply them mentally during section drafting. The canonical worked example is the `Compaction Taxonomy` table in `AGENTS.md`.

### The 3-Axis Slot Rule

Evaluate each section you're considering authoring on three axes:

1. **Trigger-frequency** — is this section *always-loaded* (consulted every turn) or *edge-case-triggered* (consulted only when a specific condition fires)? Always-loaded sections compete for per-turn context; edge-case-triggered sections can live in deeper payload files behind explicit trigger language.
2. **Failure-severity** — what's the cost of an agent missing this guidance? *Catastrophic* (breaks merge / loses data / fires §0 invariants) demands always-loaded substrate; *minor* (style nit / preference) tolerates discipline-only documentation.
3. **Enforceability** — can a tool, hook, or mechanical check enforce this rule, or does it rely on agent discipline? Mechanical-enforceable rules earn higher reliability with lower per-turn cost; discipline-only rules need explicit per-turn substrate to fire reliably.

**Worked example.** A proposed SKILL section "always cite source line numbers when referencing code" rates: trigger-frequency = always (every code reference); failure-severity = minor (drift, not catastrophe); enforceability = discipline-only. → That's a `compress-to-trigger` candidate (single line in always-loaded substrate pointing to a deeper payload section), not a multi-paragraph always-loaded section.

### The Disposition Taxonomy

For each section, assign a **disposition** declaring why it earns its slot:

- **`keep`** — section stays in always-loaded substrate; severity, frequency, and enforceability all justify the per-turn cost
- **`move`** — section content stays in the skill substrate but relocates to deeper payload (referenced via Progressive Disclosure pointer)
- **`compress-to-trigger`** — section reduced to a single trigger line in always-loaded substrate, with the body relocated to payload behind the trigger (the most common cycle-1 outcome)
- **`rewrite`** — section retained but reframed (e.g. legalese-style spec replaced with plain-discipline prose, or vice-versa)
- **`retire`** — section removed entirely; no longer earns its slot

Even at creation time, declaring the implicit disposition (`keep` for newly authored sections) forces conscious justification rather than ambient accretion.

### Substrate-vs-Discipline Tagging

For sections likely to be cited from per-turn substrate (`AGENTS.md`, `AGENTS_STARTUP.md`, frequently-loaded SKILL.md routers), tag the section with one of:

- **`MACHINE-ENFORCEABLE-CANDIDATE`** — the rule could in principle be enforced by a hook, lint, or schema check. The tag signals "this is a good target for mechanical-enforcement follow-up work."
- **`DISCIPLINE-ONLY`** — the rule depends on agent judgment and cannot be mechanically enforced. The tag signals "this needs explicit per-turn substrate to fire reliably."

Sections without one of these tags risk being treated as either over-engineering candidates for hooks, or compaction-via-removal candidates. The tag preserves authorial intent across compaction cycles.

The canonical worked example is `AGENTS.md` `Compaction Taxonomy` — every row carries its disposition + tag, making the discriminator visible to future compaction efforts.

### Byte Budget for SKILL.md Routers

Empirical floor for the `SKILL.md` router itself: **7-12 lines** (range across all 18 current skills, anchored in `learn/agentos/measurements/cognitive-load-baseline-2026-05.md` §7 *SKILL.md Router Byte-Budget Baseline*; routers exceeding 12 lines historically benefit from extracting content into payload).

This is a *discriminator*, not a hard cap. A 14-line router can be justified if the additional lines are load-bearing trigger-language; an 8-line router lacking load-bearing trigger-language can be over-engineered. Use the 7-12 line floor as the *prompt* for "should this content live here, or in payload?"

## 1. Writing the Router (SKILL.md)

The `SKILL.md` file MUST begin with a frontmatter YAML block. The system parser relies on this block to index the skill.

### Required YAML Frontmatter
```yaml
---
name: [kebab-case-name]
description: [Concise 1-2 sentence description of what the skill provides and when to invoke it (the invocation contract)]
---
```

### The Router Body
Below the YAML block, the Markdown body MUST be a concise directive instructing the agent to read the reference file. Do not put the actual knowledge here.

```markdown
# [Skill Title]
If you need to [do this task], you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/[skill-name]/references/[descriptive-payload-name].md` before proceeding.
```
*(Always use a relative path like `.agents/skills/...` for the `view_file` tool parameter).*

## 2. Writing the Payload (references/*.md)

This file contains the actual "meat" of the skill.
Since the agent relies on this when executing the specific task, make it detailed:
- Include step-by-step Standard Operating Procedures.
- Provide explicit JSON payloads or tool-chaining examples.
- Use explicit Markdown formatting (Headers, Lists, Bold text) to make it scannable for the LLM.
- **Never guess:** If the payload requires knowing the absolute path of configuration files, verify those paths before writing them into the payload.

### The "Map vs World Atlas" Constraint Placement

When documenting a rare workflow constraint (e.g., the clean-slate hard-cut for environment-variable renames), you MUST NOT pollute high-level global workflow files (the "Map", like `pull-request-workflow.md` or `ticket-intake.md`) with its full edge-case detail.
Instead, extract rare constraints into dedicated, granular payload files (the "World Atlas") and reference them only when their trigger fires.
- **The Map:** General routing, global lifecycle rules. Keep this clean and high-level to prevent context bloat.
- **The Atlas:** Tool-specific quirks, edge cases, payload shapes, and strict operational constraints.

### Tool Mechanics Live in the Tool Description, Not the Skill

Map-vs-Atlas governs *where* a tool constraint loads. A stricter rule governs *whether it belongs in a skill at all*: a skill cites tool **behavior, when-to-use, and the surrounding discipline** — it MUST NOT re-document tool **mechanics** (parameters, return shapes, call sequences, selector precedence). Those are the MCP tool description's single source of truth; a skill copy rots when the tool changes and taxes every harness on every load.

- **Before writing tool-usage into a skill, read the tool's description.** If it is already there, cite it (e.g. "scope the fetch per the `get_conversation` tool description") — never restate it.
- **A thin tool description is fixed by enriching the *tool*, not by compensating in a skill** — even an Atlas payload. Placement never excuses duplication.
- **Net-reduce ≠ relocate.** Moving mechanics from a Map to an Atlas payload optimizes *where* it loads but leaves the duplication intact. Ask "should this exist in a skill at all?", not just "where should it load?"
- **Measure bloat against the smallest-context peer** (~258k tokens), not your own — the substrate tax is paid by the leanest harness, on every load.

### Recursive Application: Workflow Files Are Also Maps (per Discussion #11314 / Epic #11319)

Map vs World Atlas applies **recursively**. A workflow file (`references/<workflow>.md`) itself becomes a Map for its own sub-rules when it grows beyond its natural load-frequency boundary.

**The discipline (per operator directive 2026-05-13):** *"the bare always-relevant minimum is in there. and edge cases as ONE LINE triggers."*

- **Always-relevant sections stay inline** in the workflow file — they fire every time the skill is loaded
- **Edge-case sections extract to sub-rule sibling files** under `references/<sub-rule>.md` or `references/<category>/<sub-rule>.md`
- **Each extracted edge-case is referenced from the workflow body via a one-line trigger pointer:**

```markdown
## §5.3 MCP-Tool-Description Budget Audit
<!-- trigger: pr touches ai/mcp/server/*/openapi.yaml → read ./audits/mcp-tool-description-budget.md -->
```

**Mechanical enforcement (Sub-A of Epic #11319 via `skills.manifest.json` + `lint-skill-manifest.mjs`):**
- `perFilePayloadBudget` (per-skill/default) fails files over cap; default 25 KB, temporary monolith overrides shrink as reductions land.
- `maxPositiveDeltaBytes` caps net `.agents/skills/**/*.md` growth; offset additions, or for new-skill/decay-mitigated exceptions put `[skill-growth-justified: <reason>]` in a commit message and cite the PR rationale.
- `checkSectionTriggers` flags >5 KB rare-trigger sections for extraction behind a trigger pointer.
- Skill reference integrity catches dangling numeric refs, broken relative links, and deleted-file refs; fix them in the same PR.

**Empirical precedent:**
- `pull-request` skill: workflow + conditionally loaded sub-rule siblings such as `env-var-rename-rule.md`, `mcp-config-template-change-guide.md`, and `review-response-protocol.md`
- `pr-review` skill: `audits/mcp-tool-description-budget.md` + `audits/loading-runtime-effect.md` — extracted edge-cases

**HNSW topography frame:** workflow Maps + sub-rule Atlases form the Middle Layer of the Hierarchical Navigable Small World structure that skill substrate empirically resembles. See Discussion #11314 §1.5 for full Top/Middle/Bottom-Layer topography.

## 3. The Lesson Promotion Path

When a swarm agent discovers a systemic trap, an architectural pattern, or a workflow optimization that took significant effort to derive, that knowledge must not die when the session ends.

**You MUST promote valuable operational lessons to the Swarm:**

1. **Locate the relevant domain:** Determine which existing skill governs the domain (e.g., `pull-request`, `neural-link`, `unit-test`).
2. **Classify before writing:** Runtime behavior becomes a compact decision atom: `Bias`, `Rule`, `Rationale`, `Trigger`. Incident history, examples, and provenance move behind atlas/provenance pointers instead of entering the runtime path.
3. **Update the smallest surface:** Edit the existing payload section that fires for the domain. Author a new skill only when the lesson represents a genuinely new operational domain.

*Why:* Skills are the permanent architectural memory of the swarm. Promoting lessons ensures the next agent does not repeat your expensive mistakes.

## 4. The Claude Symlink Mandate

The Neo.mjs agent swarm operates across multiple identities (e.g., Antigravity and Claude Code). While `.agents/skills/` is the canonical repository of skills, Claude Code relies on a dedicated `.claude/skills/` directory to parse its available tools at boot.

**CRITICAL:** Whenever you create a *new* skill folder in `.agents/skills/`, you **MUST** immediately create a corresponding symlink in the `.claude/skills/` directory.

```bash
# Run from repository root:
ln -sf ../../.agents/skills/my-new-skill .claude/skills/my-new-skill
```

Failure to create this symlink will result in Claude being entirely blind to the new protocol, causing severe swarm capability desyncs.

## Verification

Before pushing your new skill, check:
- [ ] Is there exactly one `SKILL.md` in the root of the skill folder?
- [ ] Does `SKILL.md` have the strictly formatted YAML `name` and `description` block?
- [ ] Is the heavy instructional content stored entirely in the `references/` directory?
- [ ] Does the `SKILL.md` body provide the explicit project-relative path to the reference file?
- [ ] Is `.agents/skills/skills.manifest.json` updated to mirror the frontmatter and governance fields?
- [ ] Is there a corresponding symlink for the new skill in `.claude/skills/`?
- [ ] Does `node ai/scripts/lint/lint-skill-manifest.mjs --base origin/dev` pass locally?

## PR-Open Gates for Skill Changes (create OR modify)

Any PR that **creates OR modifies** `.agents/skills/**` substrate is an **agent-consumed governance-surface** change. Beyond the skill-shape checks above, the `pr-review` Contract-Completeness + load-effect audits require **two PR-open gates** — author both **up-front** (each is documentation-only: no diff, head, or CI impact):

1. **Contract Ledger on the SOURCE TICKET** — not just the PR body. Post the T3 matrix (`learn/agentos/process/contract-ledger.md`) as a comment on the ticket / epic; the Contract-Completeness audit checks the *originating ticket*, so a PR-body-only ledger does not satisfy it.
2. **`/turn-memory-pre-flight` load-effect audit in the PR body** — document the load-runtime-effect placement: which file is the always-loaded **Map** (SKILL.md router / hot workflow §) vs the conditional **World-Atlas** payload, and that the net always-loaded delta is minimal or negative (rule bodies belong in the conditional audit, never the always-loaded Map).

Doing both up-front avoids the predictable single-cycle `CHANGES_REQUESTED` this gate otherwise fires.
