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

Empirical floor for the `SKILL.md` router itself: **7-12 lines** (anchored in `learn/agentos/measurements/cognitive-load-baseline-2026-05.md` cycle-1 baseline; routers exceeding 12 lines historically benefit from extracting content into payload).

This is a *discriminator*, not a hard cap. A 14-line router can be justified if the additional lines are load-bearing trigger-language; an 8-line router lacking load-bearing trigger-language can be over-engineered. Use the 7-12 line floor as the *prompt* for "should this content live here, or in payload?"

## 1. Writing the Router (SKILL.md)

The `SKILL.md` file MUST begin with a frontmatter YAML block. The system parser relies on this block to index the skill.

### Required YAML Frontmatter
```yaml
---
name: [kebab-case-name]
description: [Concise 1-2 sentence description of what the skill provides]
triggers: [Explicit natural language triggers for when an agent should use it]
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

## 3. The Lesson Promotion Path

When a swarm agent discovers a systemic trap, an architectural pattern, or a workflow optimization that took significant effort to derive, that knowledge must not die when the session ends.

**You MUST promote valuable operational lessons to the Swarm:**

1. **Locate the relevant domain:** Determine which existing skill governs the domain (e.g., `pull-request`, `neural-link`, `unit-test`).
2. **Update the Payload:** Edit the appropriate `references/*.md` file to append the new lesson, trap, or rule. Update the file in-place and include it in your Pull Request.
3. **Author New Skills:** If the lesson represents a completely novel operational domain, use this guide to scaffold a new skill and propose it to the human commander.

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
- [ ] Does `SKILL.md` have the strictly formatted YAML `name`, `description`, and `triggers` block?
- [ ] Is the heavy instructional content stored entirely in the `references/` directory?
- [ ] Does the `SKILL.md` body provide the explicit **absolute path** to the reference file?
- [ ] Is there a corresponding symlink for the new skill in `.claude/skills/`?
