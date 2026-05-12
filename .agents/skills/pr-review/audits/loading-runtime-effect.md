# Loading-Runtime-Effect Substitution Audit

Reactive-side companion to the proactive `/turn-memory-pre-flight` skill (Epic #11256 substrate). Fires during `/pr-review` when reviewing PRs that touch multi-loaded agent-memory files. Identifies the **substitution of FILE-COMPLETENESS dimension for RUNTIME-LOAD EFFECT dimension** as a peer-review failure mode.

## When This Audit Applies

Trigger this audit when reviewing any PR that adds, modifies, or relocates content in:

- `AGENTS.md` (universal turn-loaded memory)
- `learn/agentos/AGENTS_ATLAS.md` (conditional-load extension of AGENTS.md)
- `.agents/skills/**/SKILL.md` (per-skill maps; loaded when skill invoked)
- `.agents/skills/**/references/*.md` (per-skill atlases; loaded when skill invoked)
- `.codex/CODEX.md` (Codex harness; loaded per turn via UserPromptSubmit hook)
- `.agents/ANTIGRAVITY_RULES.md` (Antigravity harness; loaded per turn via MCP `context.fileName` config)
- `.claude/CLAUDE.md` (Claude harness; typically a symlink to `AGENTS.md`)

## The Failure Mode

A reviewer approves the PR on **FILE-COMPLETENESS dimension** — e.g., *"3 harness files have the block, cross-harness symmetry achieved"* — without verifying the **RUNTIME-LOAD EFFECT dimension** — *"does the content get loaded once or twice per turn?"*

**Distinct from rubber-stamping:** the failure here is **DIMENSION** (effect-surface unaudited), NOT **ENGAGEMENT** (content-surface IS reviewed). Substantive feedback can be given across multiple review cycles while the load-effect dimension stays invisible to the reviewer.

This is one of four enumerated Helpful-Assistant regression sub-modes per Discussion #11259 (Cycle 1.7 convergence):

1. **Deference-Bias** — asking operator/lead what to do when peer agency requires deciding
2. **Action-Bias** — acting before freshness checks, lane checks, or substrate placement checks
3. **Approval-Bias** — approving or graduating because consensus momentum feels socially easy
4. **Flattening-Bias** — collapsing distinct substrate dimensions into one simpler name or framing

Loading-runtime-effect substitution is a specific instance of **Flattening-Bias** applied to substrate-loading-semantics: the reviewer flattens "is the content present?" (file-completeness) with "is the content loaded correctly?" (runtime-effect).

## Required Mechanical Pre-Flight (Reviewer-Side)

For PRs touching the IN-SCOPE files above, the reviewer MUST run these commands to verify the runtime-load topology:

```bash
cat .codex/hooks.json                # Codex UserPromptSubmit hook config
cat .codex/hooks/codex-context.mjs   # Codex context loader (writes to stdout for hook injection)
readlink .claude/CLAUDE.md           # Claude harness substrate (symlink → AGENTS.md typically)
```

Plus inspect the active harness MCP `context.fileName` config (Antigravity additive-load surface; harness-specific path).

After running, **mentally execute** the per-turn loading sequence:
- Which agent loads which files?
- Does the substrate addition create duplication across harness loading mechanisms?
- Is the canonical-authority substrate (`AGENTS.md`) the single source of truth, with harness-local files containing references-only?

If duplication risk exists, **flag as a Required Action** to relocate the body to canonical location with references-only in harness-local files.

## Empirical Anchor (PR #11244, 2026-05-12)

PR #11244 added the `<prompt_firewall name="Helpful_Assistant_Regression_Defense">` XML block to:

- `AGENTS.md` (universal turn-loaded substrate)
- `.codex/CODEX.md` (Codex harness substrate; loaded ADDITIVELY per turn via UserPromptSubmit hook)
- `.agents/ANTIGRAVITY_RULES.md` (Antigravity harness substrate; loaded ADDITIVELY per turn via MCP `context.fileName`)

The block was **identical across all three files**. Per turn-based memory loading semantics:

- Claude agents load `AGENTS.md` (via `.claude/CLAUDE.md` symlink) — block loaded ONCE
- Codex agents load `AGENTS.md` PLUS `.codex/CODEX.md` via hook — block loaded TWICE
- Antigravity agents load `AGENTS.md` PLUS `.agents/ANTIGRAVITY_RULES.md` via MCP — block loaded TWICE

Cross-harness symmetry-of-FILES was achieved; symmetry-of-EFFECT was broken. **Three reviewers missed the duplication across four review cycles:**

- @neo-gemini-3-1-pro (author) — initial PR did not flag the duplication risk
- @neo-opus-4-7 Cycle 1+2 — focused on file-completeness; missed runtime-load effect
- @neo-gpt Cycle 1+2 — same dimension miss

The bug was surfaced via **operator V-B-A**: @tobiu directly inspected Gemini's Antigravity MCP `context.fileName` config + Codex hook script + repo-mechanical V-B-A of `.codex/hooks.json` + `.codex/hooks/codex-context.mjs`. The mechanical-V-B-A took two bash commands.

**Resolution (Option A):** canonical `<prompt_firewall>` block in `AGENTS.md` only; harness-local files (`.codex/CODEX.md`, `.agents/ANTIGRAVITY_RULES.md`) contain references-only.

Full arc: 6 review cycles + operator V-B-A to substrate-correctness.

## Substrate-Loop Completion

This audit completes the substrate-loop for the substrate-placement-discipline established by Epic #11256:

- **Proactive side** — `/turn-memory-pre-flight` fires at substrate-creation time (before the PR is authored), governing substrate placement via 5-step decision-tree + mechanical pre-flight protocol
- **Reactive side** (this audit) — peer-reviewers running `/pr-review` recognize the pattern at PR-review time via this `§7.7` Anti-Patterns table entry

Either gate fires depending on lifecycle-phase. A substrate-author who skips the proactive skill triggers, a `/pr-review` reviewer running through `§7.7` anti-patterns table would catch it via this audit.

## Cross-Skill References

- **Proactive companion:** `/turn-memory-pre-flight` (Epic #11256 substrate; AGENTS.md §21 trigger) — substrate-author invokes BEFORE substrate-mutation
- **Architectural router:** `/architecture-pre-flight` (Epic #11256 substrate; AGENTS.md §21 trigger) — when ambiguous which proactive discipline applies, route through the umbrella
- **Substrate-placement Discussion:** Discussion #11252 (CLOSED RESOLVED) — original substrate-evolution graduation source
- **Helpful-Assistant defense extensions Discussion:** Discussion #11259 (OPEN) — XML-tag-wrapper substrate codifying the four Helpful-Assistant sub-modes
