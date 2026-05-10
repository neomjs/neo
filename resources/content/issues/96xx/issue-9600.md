---
id: 9600
title: Upgrade GitHub Actions to latest major versions for Node 24 support
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-30T11:28:08Z'
updatedAt: '2026-03-30T11:29:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9600'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-30T11:29:38Z'
---
# Upgrade GitHub Actions to latest major versions for Node 24 support

**Description**
GitHub Actions runners will force JavaScript actions to run on Node.js 24 by default starting June 2nd, 2026, and Node.js 20 will be fully removed in September 2026. This causes all our `v4` actions to emit deprecation warnings.

**Resolution**
Upgrade all GitHub Actions references in our workflows to their latest major versions, which natively support the Node 24 runtime without warnings.

**Action Matrix:**
- `actions/checkout`: `v4` -> `v6`
- `actions/setup-node`: `v4` -> `v6`
- `github/codeql-action/*`: `v3` -> `v4`
- `actions/github-script`: `v7` -> `v8`
- `actions/stale`: `v9` -> `v10`

*We will also apply these updates to the `create-app` repository's workflow templates.*

## Timeline

- 2026-03-30T11:28:09Z @tobiu added the `enhancement` label
- 2026-03-30T11:28:10Z @tobiu added the `ai` label
- 2026-03-30T11:29:14Z @tobiu referenced in commit `846f6ac` - "chore(actions): Upgrade GitHub Actions to latest major versions for Node 24 support (#9600)"
- 2026-03-30T11:29:38Z @tobiu closed this issue
- 2026-03-30T11:29:41Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-30T11:29:43Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Successfully upgraded GitHub Actions to natively support the Node 24 runtime, eliminating deprecation warnings.
> 
> Updates applied:
> - `actions/checkout@v4` updated to `v6`
> - `actions/setup-node@v4` updated to `v6`
> - `github/codeql-action/*@v3` updated to `v4`
> - `actions/github-script@v7` updated to `v8`
> - `actions/stale@v9` updated to `v10`
> 
> Tested and committed to both `neo` and `create-app` repositories.


