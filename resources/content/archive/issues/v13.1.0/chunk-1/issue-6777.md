---
id: 6777
title: 'Learning Content: workspace vs repo fork'
state: CLOSED
labels:
  - documentation
  - enhancement
  - developer-experience
  - contributor-experience
  - no auto close
  - ai
assignees:
  - neo-gpt
createdAt: '2025-06-12T16:09:06Z'
updatedAt: '2026-06-25T09:29:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6777'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
closedAt: '2026-06-25T09:29:35Z'
---
# Learning Content: workspace vs repo fork

While we already have:
https://github.com/neomjs/neo/blob/dev/.github/GETTING_STARTED.md

This guide is not sufficient.

* Explain the pros and cons for creating apps
* Explain that the build programs work the same way
* Explain how to migrate an app from the repo to a workspace
* Explain how to migrate an app from a workspace to the repo

## Timeline

- 2025-06-12T16:09:08Z @tobiu added the `enhancement` label
- 2025-06-12T16:09:08Z @tobiu added the `no auto close` label
- 2025-06-12T16:11:35Z @tobiu added the `documentation` label
- 2026-06-23T05:31:13Z @neo-gpt added the `developer-experience` label
- 2026-06-23T05:31:13Z @neo-gpt added the `contributor-experience` label
### @neo-gpt - 2026-06-23T05:31:15Z

[ARCH_ALIGNMENT] Triage result: valid and claimable documentation task.

Triaged per `ticket-triage` skill. Applied: `developer-experience`, `contributor-experience`. Existing `documentation`, `enhancement`, and `no auto close` are correct.

Evidence checked:
- The ticket body names the existing insufficient surface, `.github/GETTING_STARTED.md`, and gives concrete scope: pros/cons for app creation, build-program parity, repo-to-workspace migration, and workspace-to-repo migration.
- `.github/GETTING_STARTED.md` currently explains the two starting paths at a high level, but it does not cover the migration flows or the detailed tradeoff model requested here.
- `.github/AI_QUICK_START.md` has separate AI-tooling setup notes for repo forks vs workspaces, but that is not the product-facing learning content requested by this issue.
- Existing learn/tutorial content mentions workspaces in context, but I did not find a dedicated guide that satisfies the four requested ACs.

Retrospective challenge:
- Premise passes: the current getting-started guidance is too shallow for the workspace-vs-repo decision and migration story.
- Prescription passes: learning content is the right substrate, with `.github/GETTING_STARTED.md` as a source to reference or supersede from the public `learn/` surface.
- Consumer is clear: app developers and contributors deciding whether they should work in a generated workspace or a forked repo.

Disposition: left unassigned and did not add `ai`; this is claimable as a docs implementation ticket. A good PR should pick a target guide location, wire it into the learn tree if needed, and explicitly cover the four bullets in the issue body.

- 2026-06-25T07:25:58Z @neo-gpt added the `ai` label
- 2026-06-25T07:26:02Z @neo-gpt assigned to @neo-gpt
- 2026-06-25T07:35:02Z @neo-gpt cross-referenced by PR #13993
- 2026-06-25T08:06:56Z @neo-gpt cross-referenced by #13994
### @tobiu - 2026-06-25T09:29:35Z

vastly outdated ticket. closing

- 2026-06-25T09:29:35Z @tobiu closed this issue

