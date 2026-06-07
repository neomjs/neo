---
id: 9598
title: Force Node 24 for GitHub Actions to resolve deprecation warnings
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-30T10:25:31Z'
updatedAt: '2026-03-30T10:26:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9598'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-30T10:26:39Z'
---
# Force Node 24 for GitHub Actions to resolve deprecation warnings

## Problem
Although we upgraded the GitHub actions to their latest major versions, GitHub Actions environments still default to executing them on Node.js 20. This continues causing our runs to throw deprecation warnings.

## Proposed Solution
Inject the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` environment variable at the workflow level for all workflows inside `.github/workflows/` so that the modern actions opt into the Node 24 runner properly.

## Timeline

- 2026-03-30T10:25:33Z @tobiu added the `enhancement` label
- 2026-03-30T10:25:33Z @tobiu added the `ai` label
- 2026-03-30T10:26:36Z @tobiu referenced in commit `e6af733` - "ci: Force Node 24 for GitHub Actions to resolve deprecation warnings (#9598)"
- 2026-03-30T10:26:37Z @tobiu assigned to @tobiu
- 2026-03-30T10:26:39Z @tobiu closed this issue
- 2026-05-13T07:57:15Z @neo-opus-4-7 cross-referenced by #11292
- 2026-05-13T08:00:01Z @neo-opus-4-7 cross-referenced by PR #11293
- 2026-05-13T08:29:33Z @neo-opus-4-7 referenced in commit `9188c46` - "chore(ci): bump GitHub Actions workflows from node-version 22 to 24 (#11292)

Coordinated 4-file bump per operator-authorized V-B-A:
- .github/workflows/test.yml: '22' → '24'
- .github/workflows/npm-publish.yml: '22.x' → '24' (normalize to bare-major)
- .github/workflows/data-sync-pipeline.yml: '22' → '24'
- .github/workflows/skill-manifest-lint.yml: '22' → '24'

Empirical forward-compat anchor: local dev runs node v25.9.0; project has no
engines pin nor .nvmrc — workflows were the only node-version source-of-truth.

Node 24 official schedule (per @neo-gpt Cycle 1 V-B-A correction; original
commit body had training-data temporal drift):
- Initial release: 2025-05-06
- Active LTS since: 2025-10-28 (6+ months ago as of 2026-05-13)
- Maintenance LTS starts: 2026-10-20
- End-of-Life: 2028-04-30

Related (substrate-adjacent, not duplicate): #9598 + #9600 addressed the
actions infrastructure runtime + setup-node@v6 upgrade; this PR addresses
the user-project script runtime pinning."
- 2026-05-13T10:17:41Z @tobiu referenced in commit `ae03634` - "chore(ci): bump GitHub Actions workflows from node-version 22 to 24 (#11292) (#11293)

Coordinated 4-file bump per operator-authorized V-B-A:
- .github/workflows/test.yml: '22' → '24'
- .github/workflows/npm-publish.yml: '22.x' → '24' (normalize to bare-major)
- .github/workflows/data-sync-pipeline.yml: '22' → '24'
- .github/workflows/skill-manifest-lint.yml: '22' → '24'

Empirical forward-compat anchor: local dev runs node v25.9.0; project has no
engines pin nor .nvmrc — workflows were the only node-version source-of-truth.

Node 24 official schedule (per @neo-gpt Cycle 1 V-B-A correction; original
commit body had training-data temporal drift):
- Initial release: 2025-05-06
- Active LTS since: 2025-10-28 (6+ months ago as of 2026-05-13)
- Maintenance LTS starts: 2026-10-20
- End-of-Life: 2028-04-30

Related (substrate-adjacent, not duplicate): #9598 + #9600 addressed the
actions infrastructure runtime + setup-node@v6 upgrade; this PR addresses
the user-project script runtime pinning.

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>"

