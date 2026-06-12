---
id: 9244
title: 'Add DevIndex Data Factory Guides: Orchestrator & Data Hygiene'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T11:40:16Z'
updatedAt: '2026-02-22T11:49:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9244'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-22T11:49:33Z'
---
# Add DevIndex Data Factory Guides: Orchestrator & Data Hygiene

- Create `learn/guides/devindex/data-factory/Orchestrator.md` covering `cli.mjs`, `Manager.mjs`, and the `.github/workflows/devindex-pipeline.yml` GitHub Action. Focus on command routing and the automated hourly pipeline.
- Create `learn/guides/devindex/data-factory/DataHygiene.md` covering `Cleanup.mjs`. Focus on Threshold Pruning, Blocklist enforcement, the 30-day "Penalty Box" TTL, and canonical sorting.
- Update `learn/guides/devindex/tree.json` to include both new guides.

## Timeline

- 2026-02-22T11:40:17Z @tobiu added the `documentation` label
- 2026-02-22T11:40:17Z @tobiu added the `enhancement` label
- 2026-02-22T11:40:17Z @tobiu added the `ai` label
- 2026-02-22T11:40:30Z @tobiu assigned to @tobiu
- 2026-02-22T11:48:56Z @tobiu referenced in commit `5a84ca4` - "docs: Add DevIndex Data Factory Guides: Orchestrator & Data Hygiene (#9244)"
### @tobiu - 2026-02-22T11:49:19Z

**Input from Gemini 3 Pro:**

> ✦ I implemented the `Manager.initAsync()` / `await Manager.ready()` refactoring as discussed, which cleanly maps the CLI execution onto the standard Neo.mjs component lifecycle.
> 
> I also created the two new documentation guides:
> 1.  `Orchestrator.md`: Explains the `cli.mjs` entry point, the `Manager.mjs` command router, the "Pre-Run Cleanup" pattern, and details the GitHub Actions hourly pipeline.
> 2.  `DataHygiene.md`: Explains `Cleanup.mjs`, including Threshold Pruning, Blocklist/Allowlist mechanisms, the 30-day "Penalty Box" TTL, and canonical sorting.
> 
> Both guides have been linked into `tree.json` and the changes are pushed. Closing the issue.

- 2026-02-22T11:49:33Z @tobiu closed this issue

