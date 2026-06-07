---
id: 9701
title: Implement Progressive Disclosure for Agent Skills Context Assembly
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T17:09:11Z'
updatedAt: '2026-04-04T17:12:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9701'
author: tobiu
commentsCount: 1
parentIssue: 9672
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T17:12:08Z'
---
# Implement Progressive Disclosure for Agent Skills Context Assembly

### Background
Currently, `Neo.ai.context.Assembler` loads the entirety of all `.agent/skills/*/SKILL.md` files into the system prompt unconditionally for every session. As we build massive instructional frameworks (like the 87-line `unit-test` guide), this causes severe context window bloat and distracts the background LLM during unrelated tasks.

### Proposed Solution
Implement the Anthropic "Progressive Disclosure" strategy within `ContextAssembler.loadSkillsSync()`:
1. Parse the YAML Frontmatter of each `SKILL.md` to extract `name`, `description`, and explicit `triggers`.
2. Inject *only* these lightweight triggers into the `<agent_skills>` block of the overarching continuous system prompt.
3. Remove the injection of the full `SKILL.md` markdown body.
4. Refactor `.agent/workflows/unit-test.md` into a self-contained `.agent/skills/unit-test/` folder (where the `SKILL.md` acts purely as the routing trigger, and the heavy Markdown is kept in a `/references/` subfolder).

*Note: This will be linked as a sub-task of Epic #9672.*

## Timeline

- 2026-04-04T17:09:11Z @tobiu added the `enhancement` label
- 2026-04-04T17:09:11Z @tobiu added the `ai` label
- 2026-04-04T17:09:18Z @tobiu added parent issue #9672
- 2026-04-04T17:09:39Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-04T17:12:01Z

Progressive Disclosure logic implemented successfully. ContextAssembler now natively strips the YAML frontmatter for all `.agent/skills/*/SKILL.md` files instead of injecting their entire body, drastically reducing unnecessary prompting overhead. The `unit-test.md` file was restructured into this new pattern mapping to the `/references/` sub-directory folder.

- 2026-04-04T17:12:08Z @tobiu closed this issue
- 2026-04-04T17:12:40Z @tobiu referenced in commit `d7cd447` - "feat: implement progressive disclosure for agent skills (#9701)"
- 2026-04-04T17:14:28Z @tobiu referenced in commit `6d9c97a` - "test: utilize assembler.ready() lifecycle in tests (#9701)"
- 2026-04-30T09:19:09Z @neo-gemini-3-1-pro cross-referenced by #10521
- 2026-04-30T09:28:37Z @neo-gpt cross-referenced by PR #10522
- 2026-05-06T16:54:10Z @neo-opus-4-7 referenced in commit `56ee8bd` - "fix(skills): revert pr-review-guide §7.6 anti-patterns row addition (#10826)

Operator-relayed calibration: `pr-review-guide.md` is the always-loaded
payload of a high-traffic skill (45,210 bytes / 436 lines per
cognitive-load-baseline-2026-05.md). Even a single substantive row
addition compounds the per-PR-review byte cost across the swarm.

Per Progressive Disclosure pattern (skill-authoring-guide §"Slot-Rule
Discriminator", origin in #9698 / #9701, summary_d87e357e 2026-04-04):
the §7.6 row should have rated `compress-to-trigger` not `keep` —
trigger-frequency every-PR-review, failure-severity moderate, env-var-
rename PRs are low-frequency relative to total review surface.

Substrate (rule body in pull-request-workflow.md §1.1.1) fires at PR-
authoring time which is the right moment. Reviewers covering env-var-
rename PRs already trigger §1.1 Substrate-Mutation Pre-Flight Gate
(touches .agents/skills/** etc.) so the §7.6 row was over-engineering
the always-loaded reviewer surface.

Aligns with Epic #10733 (cognitive-load audit) byte-reduction direction.

Co-authored-by: Claude Opus 4.7 <neo-opus-4-7@neomjs.com>"
- 2026-05-06T16:55:24Z @neo-opus-4-7 cross-referenced by PR #10828
- 2026-05-06T17:19:45Z @tobiu referenced in commit `7af53f8` - "feat(skills): codify clean-slate sunset rule for env-var renames (#10826) (#10828)

* feat(skills): codify clean-slate sunset rule for env-var renames (#10826)

Adds pull-request-workflow.md §1.1.1 with the clean-slate hard-cut rule:
env-var renames must rename code + .env + tests in ONE PR, no legacyEnvVar
parameters, no console.warn deprecation chains, no multi-layer fallback.
Released-version compat exception requires explicit sunset trigger
documentation (commit SHA / version / N-cycles-from-merge).

Cross-links the rule from pr-review-guide.md §7.6 anti-patterns table so
reviewers can immediately reject deprecation chains at first cycle.

Empirical anchor: PRs #10808 / #10810 / #10814 each added env-var
deprecation chains protecting users-who-don't-exist (legacy vars never
shipped in a released npm version). AGENTS.md §13 substrate-accretion-
defense was empirically not enforced at PR-review time; this rule
codifies the gate at the workflow surface where authors author and
reviewers review.

Resolves AC3 of Epic #10822 Config substrate cleanup.
Calibration absorbed: env-var precedence remains intentional (Playwright,
sub-agents, operator overrides all rely on env-first); the rule eliminates
deprecated-name fallback chains UNDERNEATH env-var resolution, not the
env-var-first precedence itself.

Co-authored-by: Claude Opus 4.7 <neo-opus-4-7@neomjs.com>

* fix(skills): revert pr-review-guide §7.6 anti-patterns row addition (#10826)

Operator-relayed calibration: `pr-review-guide.md` is the always-loaded
payload of a high-traffic skill (45,210 bytes / 436 lines per
cognitive-load-baseline-2026-05.md). Even a single substantive row
addition compounds the per-PR-review byte cost across the swarm.

Per Progressive Disclosure pattern (skill-authoring-guide §"Slot-Rule
Discriminator", origin in #9698 / #9701, summary_d87e357e 2026-04-04):
the §7.6 row should have rated `compress-to-trigger` not `keep` —
trigger-frequency every-PR-review, failure-severity moderate, env-var-
rename PRs are low-frequency relative to total review surface.

Substrate (rule body in pull-request-workflow.md §1.1.1) fires at PR-
authoring time which is the right moment. Reviewers covering env-var-
rename PRs already trigger §1.1 Substrate-Mutation Pre-Flight Gate
(touches .agents/skills/** etc.) so the §7.6 row was over-engineering
the always-loaded reviewer surface.

Aligns with Epic #10733 (cognitive-load audit) byte-reduction direction.

Co-authored-by: Claude Opus 4.7 <neo-opus-4-7@neomjs.com>

* refactor(skills): restructure env-var-rename rule per Progressive Disclosure (#10826)

Operator-relayed Cycle 3 calibration: 21-line rule body in
pull-request-workflow.md §1.1 + 1-row reference in pr-review-guide.md
§7.6 was inverted. Rule body should live in a NEW dedicated reference
file behind triggers; both high-traffic substrate files should carry
ONLY minimal triggers per Progressive Disclosure pattern.

Per skill-authoring-guide §"Slot-Rule Discriminator" + cognitive-load-
baseline-2026-05.md byte-budget targeting:
- pull-request-workflow.md (22,638 bytes baseline) loses 19 lines (was
  21-line rule body, now 1-line trigger)
- pr-review-guide.md (45,210 bytes baseline) gains 1-line trigger row
  (Cycle 2 reverted the original; Cycle 3 restores as proper trigger)
- New ai/skills/pull-request/references/env-var-rename-rule.md (30
  lines) holds the rule body — loaded conditionally only when trigger
  fires (PR touches env-var resolvers)

File renamed from "sunset-rule" to "env-var-rename-rule" per operator:
"sunset" namespace collides with /session-sunset skill. Topic-preserving
name: env vars in general; action: hard cut / one shot.

Net delta: -18 lines on always-loaded substrate; +30 lines in
conditional payload. Aligns with Epic #10733 cognitive-load audit.

Co-authored-by: Claude Opus 4.7 <neo-opus-4-7@neomjs.com>

* fix(skills): remove harness-private memory citation + correct Neo identity framing (#10826)

Operator-relayed calibration on env-var-rename-rule.md "Why no
deprecation chains" rationale:

- Removed `feedback_neo_is_engine_not_framework` citation per
  feedback_no_harness_private_load_bearing_citations rule (Claude
  Code memory file; not a public-anchor citation).
- Replaced "Engine-class deployments" framing with accurate Neo
  identity framing per README.md: Neo is a self-evolving digital
  organism (Brain + Institution + Body + Evolution), not a
  framework/engine binary. The framing now describes the operator
  population directly (swarm + selected partners deploying the
  Agent OS) without invoking misleading framework-vs-engine
  category metaphors.

Substantively the conclusion is unchanged: framework-class
deprecation chains assume an external user base across release
windows; that assumption doesn't apply to Neo's substrate
deployment topology, so KISS hard-cut renames are correct.

Co-authored-by: Claude Opus 4.7 <neo-opus-4-7@neomjs.com>

---------

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>"

