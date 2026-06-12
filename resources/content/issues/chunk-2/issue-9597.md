---
id: 9597
title: Update GitHub Actions to v4 to resolve Node 20 deprecation warnings
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-30T10:09:39Z'
updatedAt: '2026-03-30T10:12:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9597'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-30T10:12:42Z'
---
# Update GitHub Actions to v4 to resolve Node 20 deprecation warnings

## Problem
The GitHub Actions runners are deprecating Node.js 20, which is currently used by older versions of standard actions in our CI/CD pipelines. This produces warnings on our workflow runs.

## Proposed Solution
Upgrade the following actions to their newer, modernized major versions:
- `actions/checkout` to `@v4` (in both `npm-publish.yml` and `codeql-analysis.yml`)
- `actions/setup-node` to `@v4` (in `npm-publish.yml`)
- `github/codeql-action/*` to `@v3` (in `codeql-analysis.yml`)

## Timeline

- 2026-03-30T10:09:40Z @tobiu added the `enhancement` label
- 2026-03-30T10:09:40Z @tobiu added the `ai` label
- 2026-03-30T10:12:18Z @tobiu referenced in commit `a61db50` - "ci: Update GitHub Actions to major version to resolve Node 20 deprecation (#9597)"
### @tobiu - 2026-03-30T10:12:29Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ I have updated the github actions to their v3 and v4 major versions in `npm-publish.yml` and `codeql-analysis.yml`. Commits have been pushed to the `dev` branch.

- 2026-03-30T10:12:40Z @tobiu assigned to @tobiu
- 2026-03-30T10:12:42Z @tobiu closed this issue

