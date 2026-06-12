---
id: 9698
title: 'Feature: Agent Skill Loader & Ideation Sandbox'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T16:18:22Z'
updatedAt: '2026-04-04T16:40:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9698'
author: tobiu
commentsCount: 1
parentIssue: 9693
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T16:40:22Z'
---
# Feature: Agent Skill Loader & Ideation Sandbox

### Problem
Agents currently lack a native mechanism to adopt specialized operational workflows (`SKILL.md` constraints) dynamically from the filesystem. Furthermore, autonomous agents engaging in architectural exploration generates speculative tickets that pollute the actionable issue tracker.

### Solution
1. **Agent Skill Loader:** Modified `Neo.ai.context.Assembler` to dynamically scan the `ai/skills/` directory on initialization and append all `SKILL.md` definitions into the `<agent_skills>` tagging structure within the LLM's core system prompt.
2. **Ideation Sandbox:** Added the `ideation-sandbox/SKILL.md` skill, enforcing a strict mandate for the agent to redirect highly speculative thoughts, unknowns, and abstract ideation into GitHub Discussions using the `Ideas` category via the `create_discussion` tool.
3. Fixed `ai/services.mjs` broken paths reflecting the `GraphService` migration implemented in a prior session.

## Timeline

- 2026-04-04T16:18:24Z @tobiu added the `enhancement` label
- 2026-04-04T16:18:24Z @tobiu added the `ai` label
- 2026-04-04T16:18:30Z @tobiu added parent issue #9693
### @tobiu - 2026-04-04T16:36:22Z

**Input from Antigravity (gemini-2.5-pro):**

> ✦ Skill loader parser and Ideation Sandbox skill merged successfully. Passes all unit tests.
> 
> To align with modern agentic ecosystem standards (e.g. Anthropic, Antigravity) and best practices for progressive disclosure, the default parsing path for the Agent ContextAssembler was migrated from the framework core `/ai/skills/` to the hidden `/neo/.agent/skills/` directory. 
> 
> This maintains a strict architectural boundary between AI framework engine logic and top-level workflow configurations.

- 2026-04-04T16:40:18Z @tobiu referenced in commit `31f2f0c` - "feat(ai): Agent Skill Loader & Ideation Sandbox implementation (#9698)"
- 2026-04-04T16:40:19Z @tobiu assigned to @tobiu
- 2026-04-04T16:40:22Z @tobiu closed this issue
- 2026-05-06T16:54:10Z @neo-opus-ada referenced in commit `56ee8bd` - "fix(skills): revert pr-review-guide §7.6 anti-patterns row addition (#10826)

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

Co-authored-by: Claude Opus 4.7 <neo-opus-ada@neomjs.com>"
- 2026-05-06T16:55:24Z @neo-opus-ada cross-referenced by PR #10828
- 2026-05-06T17:19:44Z @tobiu referenced in commit `7af53f8` - "feat(skills): codify clean-slate sunset rule for env-var renames (#10826) (#10828)

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

Co-authored-by: Claude Opus 4.7 <neo-opus-ada@neomjs.com>

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

Co-authored-by: Claude Opus 4.7 <neo-opus-ada@neomjs.com>

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

Co-authored-by: Claude Opus 4.7 <neo-opus-ada@neomjs.com>

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

Co-authored-by: Claude Opus 4.7 <neo-opus-ada@neomjs.com>

---------

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>"

