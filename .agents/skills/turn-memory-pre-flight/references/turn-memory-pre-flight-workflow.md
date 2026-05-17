# Turn Memory Pre-Flight Workflow

This atlas defines the authoritative discipline for placing and mutating memory substrate that affects future agent sessions.

## The Core Problem: Future-Session Mutation Risk

When agents add new memory substrate (`AGENTS.md`, `AGENTS_ATLAS.md`, or `.agents/skills/**`), they inherently mutate the *future* boot context for all subsequent agent sessions. Improper placement (e.g., adding highly specific tactical rules to the global `AGENTS.md` file) leads to substrate fatigue, context exhaustion, and priority inversion in unrelated tasks.

## Substrate Boundary

**IN-SCOPE:** Placement of turn-loaded or skill-loaded memory substrate whose wrong placement can affect future sessions before task-specific context is chosen. This covers: `AGENTS.md`, `learn/agentos/AGENTS_ATLAS.md`, `.agents/skills/**/SKILL.md` (maps), `.agents/skills/**/references/*.md` (atlases), `.codex/CODEX.md`, `.agents/ANTIGRAVITY_RULES.md`, `.claude/CLAUDE.md`, and any future harness-local turn-injection surface.

**OUT-OF-SCOPE:** Ordinary architecture substrate placement (`.mjs` files, configs, MCP tools, daemons, services, build pipeline, OpenAPI schemas). These route through the `/architecture-pre-flight` umbrella and `/structural-pre-flight` (`.mjs`).

**CARVE-OUT:** `learn/agentos/*.md` docs are IN-SCOPE only if directly turn-loaded or skill-loaded (e.g., referenced by AGENTS.md or by a SKILL.md map). Otherwise OUT-OF-SCOPE.

## The Placement Decision Tree

Before committing ANY change to the agent memory substrate, you **MUST** evaluate the change against this decision tree:

### Step 1: Does this rule apply to EVERY single agent turn universally?
- **YES:** Can it be mechanically enforced?
  - **YES:** Candidate for `AGENTS.md` §0 (Critical Gates) or §3 (Pre-Commit Hard Gates).
  - **NO:** Candidate for `AGENTS.md` §13 (Values/Continuous Loop) or the Mailbox Protocol.
- **NO:** Proceed to Step 2.

### Step 2: Does this rule govern a specific, identifiable agent lifecycle event or workflow?
(e.g., creating a ticket, opening a PR, reviewing code, debugging a test)
- **YES:** This is a **Skill**. It must be placed in a dedicated `.agents/skills/[skill-name]/SKILL.md` file. Add a 1-line trigger to the skills manifest so agents know *when* to invoke it. Follow `/create-skill` guidelines.
- **NO:** Proceed to Step 3.

### Step 3: Is this an edge-case, historical anchor, or detailed protocol for a rare scenario?
- **YES:** This is an **Atlas entry**. It must be placed in `learn/agentos/AGENTS_ATLAS.md`. Add a 1-line pointer to the edge-case triggers section of `AGENTS.md`.
- **NO:** Proceed to Step 4.

### Step 4: Is it a Harness-Local rule?
- **YES:** Add to the specific harness integration file (`.codex/CODEX.md`, `.claude/CLAUDE.md`, `.agents/ANTIGRAVITY_RULES.md`).
- **NO:** Proceed to Step 5.

### Step 5: None of the Above
The rule is likely too narrow, tactical, or project-specific. Consider whether it belongs in project documentation (`README.md`, `CONTRIBUTING.md`), a Knowledge Base Item (KI), or if it shouldn't be global substrate at all.

## Mechanical Pre-Flight Protocol

Before mutating harness-loading files, verify how the substrate is loaded by running these commands to check empirical impact:
1. `cat .codex/hooks.json`
2. `cat .codex/hooks/codex-context.mjs`
3. Verify harness MCP `context.fileName` checks.
4. `readlink .claude/CLAUDE.md`

## Fallback Pattern

If runtime-load effect cannot be mechanically verified OR substrate-axis is ambiguous (could be turn-loaded OR ordinary architecture), the skill MUST tag the observation as `[hypothesis — needs V-B-A]` per `pr-review-guide.md §7.4` discipline AND halt substrate-creation pending operator/peer empirical verification. Bypass NOT permitted on ambiguity-flag-set.

## Progressive Disclosure Subsumption

This protocol subsumes the Progressive Disclosure philosophy (Issue #10837). Always prefer moving detailed instructions to Skills or the Atlas, leaving only the trigger conditions in the core `AGENTS.md` memory.

## Empirical Anchors

- **PR #11250:** Substrate placement bug — Loading-runtime-effect substitution anti-pattern landed in wrong skill atlas (`peer-role-mode.md §7` instead of `pr-review-guide.md §7.7`).
- **PR #11244:** 6-cycle arc (DIMENSION-vs-ENGAGEMENT predecessor failure mode).
- **Epic #11256:** This Epic serves as a recursive substrate-validation anchor.

## Cross-Skill References

- For broad architectural choices spanning multiple substrates, fall back to `/architecture-pre-flight`.
