---
id: 12
title: Publish neo.mjs as a npm package
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2019-11-17T13:16:03Z'
updatedAt: '2019-11-17T13:16:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/12'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-11-17T13:16:24Z'
---
# Publish neo.mjs as a npm package




## Timeline

- 2019-11-17T13:16:03Z @tobiu added the `enhancement` label
### @tobiu - 2019-11-17T13:16:24Z

![Screenshot 2019-11-17 at 14 13 39](https://user-images.githubusercontent.com/1177434/69007937-d1c50e80-0944-11ea-8657-0968ec7cfe4a.png)


- 2019-11-17T13:16:24Z @tobiu closed this issue
- 2026-05-08T12:52:47Z @neo-opus-4-7 cross-referenced by #10961
- 2026-05-08T12:58:45Z @neo-opus-4-7 cross-referenced by PR #10963
- 2026-05-08T13:13:33Z @neo-opus-4-7 cross-referenced by #10960
- 2026-05-08T14:40:26Z @tobiu referenced in commit `ff62fbb` - "feat(ai): v13 Project reconciliation script + observability-only docs (#10961) (#10963)

* feat(ai): v13 Project reconciliation script + observability-only docs (#10961)

Phase B of #10961 (graduated from Discussion #10959). Phase A (Project
creation, label application, item population, repo-link, public visibility)
landed via direct GraphQL mutations + operator UI flip; this PR ships the
reconciliation tooling + canonical doc edits per OQ4 resolution.

## Reconciliation script (AC5)

`ai/scripts/reconcileV13Project.mjs` reports drift between the canonical
`release:v13` labeled set and ProjectV2 #12 membership. Default = report-only;
`--apply` heals "labeled but not in Project" by adding missing items. Does
NOT auto-remove "in Project but not labeled" — operator/peer judgment decides
label-or-remove. Per OQ3 resolution: Project carries no canonical state, so
the script is one-way (label is canonical → Project mirrors).

Empirical first-run on the live Project surfaced 11 unlabeled-Project-items
(historical multi-tenant work + closed primary/secondary fixture #10948 +
shared-deployment trio #10692/#10693/#10694). Script flagged them correctly;
operator/peer triage will resolve.

`npm run ai:reconcile-v13-project` runs the script via the standard ai:*
script convention.

## Docs (AC6, OQ4 resolution)

`learn/agentos/GitHubWorkflow.md` gains §7 "GitHub Projects v2 — Read-Only
Derived View Substrate":
- Source-of-truth contract: label canonical, Project derived
- "If it's not on the Issue, it doesn't exist to the Swarm" rule
  (@neo-gemini-3-1-pro's framing from Discussion #10959 OQ3)
- Reconciliation usage
- v2-only mandate (classic sunset 2024-2025)
- Membership shape (ProjectV2Owner = Org/User; repo via linkProjectV2ToRepository)

`learn/agentos/DreamPipeline.md` gains explicit non-input warning: Project
state is NOT consumed by DreamService / GoldenPathSynthesizer. Priority
math reads issue substrate (parent_child + labels + state + comments + KB +
Memory Core), not Project metadata. By-design observability-only contract.

## Phase A status (already landed pre-PR via direct GraphQL)

- Project #12 "Neo v13 Release" created, public, repo-linked to neomjs/neo
- 24 release:v13-labeled issues populated as Project items
- AC1-AC4 + AC9-AC10 satisfied

## Acceptance Criteria status (against #10961)

- [x] AC1-AC4 — Project creation + views + membership + automation rules
      (Phase A; views/automation deferred to incremental polish)
- [x] AC5 — reconcileV13Project.mjs script committed; runnable via
      npm run ai:reconcile-v13-project; reports drift correctly
- [x] AC6 — docs updated (GitHubWorkflow + DreamPipeline)
- [ ] AC7 — post-pilot evaluation (after M1-M3); separate work
- [ ] AC8 — no MCP tool added (deferred per OQ1 promotion threshold);
      this PR adds zero MCP surface
- [x] AC9 — Project public verified via GraphQL (operator UI flip)
- [x] AC10 — pure ProjectV2 GraphQL surface (no classic primitives)

Co-Authored-By: tobiu <tobiasuhlig78@gmail.com>

* fix(ai): correct --apply exit semantics in reconcileV13Project (#10961)

Per peer review on PR #10963: the script always exited 1 even when --apply
fully healed drift. Three changes:

1. Added `throws` option to gh() helper so the per-item add loop can catch
   failures and increment a counter; previously gh() called process.exit(2)
   on first failure, bypassing the counter entirely.
2. Final exit derived from (APPLY && applyFailed === 0 && inProjectNotLabeled.length === 0)
   so --apply with no per-item failures and no residual unlabeled items
   exits 0.
3. JSDoc updated to document all three exit-code cases explicitly.

Empirical verification: report-only run with current drift state (24 labeled,
35 in Project, 11 unlabeled) returns exit 1 — same observable as before but
now structurally derived rather than hardcoded.

Companion: ticket bodies #10960 + #10961 amended with "Update 2026-05-08"
header documenting the label-driven canonical membership pivot (forced by
GitHub's single-parent constraint), retaining original framing for decision
history.

Refs PR #10963 review by @neo-gpt — IC_kwDODSospM8 review.

---------

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>"
- 2026-05-08T15:45:26Z @neo-opus-4-7 cross-referenced by PR #10967
- 2026-05-11T19:34:37Z @neo-gpt cross-referenced by PR #11227
- 2026-05-11T21:49:06Z @neo-opus-4-7 cross-referenced by #11233
- 2026-05-11T22:14:10Z @neo-opus-4-7 cross-referenced by PR #11234
- 2026-05-12T00:25:57Z @neo-gemini-3-1-pro cross-referenced by PR #11246
- 2026-05-12T02:32:02Z @neo-opus-4-7 cross-referenced by PR #11247

