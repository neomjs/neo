# PR-Review Anti-Patterns (Depth Floor catalogue)

<!-- Map: pr-review-guide.md -->

Consulted on demand, when a review smells wrong and you want the named failure. Each row names the section
of the Map that owns the rule; this file is the catalogue, never the rule.

Moved here from the Map's Depth Floor so the always-loaded guide carries a trigger instead of the table.
Rule text is unchanged; the only edit was re-anchoring each bare section ref to name the guide, because a
bare ref resolves against the file it sits in and would have silently pointed at headings this file lacks.

**Ratchet:** the `pr-review` per-file cap moved 37000 -> 33700 with this extraction, one-way. Each future
extraction lowers it by at least what it recovers; the finish line is the global 25000, so the next section
to leave the Map has a named target rather than an open allowance.

| Anti-pattern | Why it fails the Depth Floor |
|---|---|
| Unexplained score (evaluative deduction or descriptive characterization missing) | Cosmetic; pr-review-guide.md §3.1 violated |
| Pre-ticked "All checks pass" placeholder in Required Actions | Null-state dressed as action; pr-review-guide.md §5 Zero-Issue PR Semantics violated |
| Fully affirming review with no challenges or documented search | pr-review-guide.md §7.1 Minimum-One-Challenge violated |
| Approval without cross-skill integration check on PRs introducing new workflow conventions | pr-review-guide.md §8 Cross-Skill Integration Audit violated |
| Style-calibrating toward the other model family's tone | pr-review-guide.md §7.2 — the floor keeps rigor universal, not style convergence |
| Ignoring Chain of Custody | pr-review-guide.md §7.3 Provenance Audit violated on a major abstraction |
| Approval without rhetorical-drift audit on a PR carrying substantive architectural prose | pr-review-guide.md §7.4 Rhetorical-Drift Audit violated; framing drifts from mechanical reality, poisons `ask_knowledge_base` ingestion |
| Claiming execution from a static diff/author prose, ignoring an obvious non-CI receipt gap, or running a test without a named falsifier | pr-review-guide.md §7.5 Test-Evidence & Location Audit violated; CI owns routine execution, authors own existing non-CI coverage, and reviewer tests target concrete concerns |
| Approving a PR with failing CI or security checks (like CodeQL) | pr-review-guide.md §7.6 CI / Security Checks Audit violated; fundamentally unsafe code |
| PR names an epic as close-target without flagging | pr-review-guide.md §5.2 Close-Target Audit violated; risks epic auto-close-with-open-subs (see `#9999` sabotage chain) |
| Re-escalating Required Action without superior empirical evidence after `[REJECTED_WITH_RATIONALE]` | pr-review-guide.md §9.1 Reviewer-Yield Protocol violated; reviewers must yield to author's empirical evidence |
| PR adds bloated multi-line OpenAPI tool description without flagging | pr-review-guide.md §5.3 MCP-Tool-Description Budget Audit violated; bloat compounds across the tool surface and competes with agent reasoning budget at runtime |
| Substantive review comment posted without atomic `manage_pr_review` | Cross-family gate sits outside the fail-closed budget (item 7 violated). Direct `gh pr review` / UI = bypass-with-telemetry only: meter + disclose `[review-budget-bypass] reason: ...`; never an equivalent fallback. |
| PR adds env-var deprecation chain | Read `pull-request/references/env-var-rename-rule.md` |
| Cycle-1 Request Changes with iterative Required Actions when PR premise is structurally invalid | pr-review-guide.md §9.0 Cycle-1 Premise Pre-Flight violated; "fix-these-N" normalized as merge-path when Drop+Supersede was substrate-correct (Velocity-Preservation Bias) |
| Approving multi-loaded agent-memory substrate by FILE-COMPLETENESS only, skipping the RUNTIME-LOAD-EFFECT audit | Loading-runtime-effect substitution — pr-review-guide.md §7.8 + PR `#11244`; companion `/turn-memory-pre-flight`. |
| PR adds substantive rule body directly to always-loaded skill substrate (`SKILL.md`, `pr-review-guide.md`, `pull-request-workflow.md`, `AGENTS.md`) instead of conditionally loaded `references/` payload | **Progressive Disclosure violation** — Map (always-loaded) vs World Atlas (conditional reference) split bypassed; bloats per-turn token budget. Default disposition for new rules is `compress-to-trigger` per `pull-request-workflow.md §1.1`. Proactive companion: `/create-skill`. Required Action: reshape to Map (trigger line) → Atlas (rule body in `references/`) split, or cite per-turn frequency + irreversibility justifying `keep` slot |
