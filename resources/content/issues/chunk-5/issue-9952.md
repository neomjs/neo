---
id: 9952
title: 'Sandman Handoff: Top 5 Actionable Tasks Dashboarding'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-13T09:28:32Z'
updatedAt: '2026-04-14T09:21:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9952'
author: tobiu
commentsCount: 0
parentIssue: 9950
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9939 Epic: Autonomous Worker Dispatcher Pipeline (RLAIF Phase 2)'
closedAt: '2026-04-14T09:19:38Z'
---
# Sandman Handoff: Top 5 Actionable Tasks Dashboarding

### Goal
Elevate `sandman_handoff.md` from a passive dream summary into an executive, high-level priority dashboard for the Strategic Co-Founder persona.

### Implementation Checklist
- [x] Optimize the `DreamService` topological extraction logic to dynamically dump prioritized active tickets natively into the handoff file.
  - Sliced the capability gaps to Top 5 per vector to reduce noise, adding cumulative counts to headers for high-level observability.
  - Prepended a 'Latest Priority Backlog' to extract the top 5 highest open tracking IDs, stripping any natively tagged `needs-re-triage` tasks.
  - Display extracted GitHub Issue labels inline (e.g., `[needs-re-triage]`) using Markdown to provide architectural visibility.
- [x] Ensure the file is strictly formatted to eliminate "Zero-State Amnesia" upon boot, providing Frontier Models with immediate context-switching targets without requiring manual tool queries.
  - Hardened string-interpolation logic to prevent excessive whitespace generation and redundant empty lines in the output markdown payload.
  - Implemented deduplication logic checking the `goldenIds` `Set()` to prevent duplicate references appearing in both Computed Golden Path and Latest Backlog arrays natively.

## Timeline

- 2026-04-13T09:28:34Z @tobiu added the `documentation` label
- 2026-04-13T09:28:35Z @tobiu added the `enhancement` label
- 2026-04-13T09:28:35Z @tobiu added the `ai` label
- 2026-04-13T09:28:48Z @tobiu added parent issue #9950
- 2026-04-13T09:38:55Z @tobiu changed title from **Purge Git Mandates & Optimize Dashboard** to **Sandman Handoff: Top 10 Actionable Tasks Dashboarding**
- 2026-04-13T11:13:22Z @tobiu cross-referenced by #9963
- 2026-04-13T11:13:33Z @tobiu marked this issue as blocking #9939
- 2026-04-14T09:15:52Z @tobiu referenced in commit `423e346` - "feat/enhance: Optimize DreamService dashboard generation logic (#9952)"
- 2026-04-14T09:16:03Z @tobiu assigned to @tobiu
- 2026-04-14T09:16:10Z @tobiu changed title from **Sandman Handoff: Top 10 Actionable Tasks Dashboarding** to **Sandman Handoff: Top 5 Actionable Tasks Dashboarding**
- 2026-04-14T09:16:13Z @tobiu cross-referenced by PR #9995
- 2026-04-14T09:19:38Z @tobiu referenced in commit `5c63cec` - "feat/enhance: Optimize DreamService dashboard generation logic (#9952) (#9995)"
- 2026-04-14T09:19:38Z @tobiu closed this issue

