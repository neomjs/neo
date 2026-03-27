---
id: 9232
title: 'DevIndex: Rename blacklist and whitelist to blocklist and allowlist'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-21T15:45:36Z'
updatedAt: '2026-02-21T15:47:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9232'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T15:47:17Z'
---
# DevIndex: Rename blacklist and whitelist to blocklist and allowlist

### Description
To ensure we use inclusive, sensitive, and accurate wording throughout our codebase, we need to rename references of "blacklist" and "whitelist" to "blocklist" and "allowlist".

### Requirements
1. Rename `apps/devindex/resources/blacklist.json` to `blocklist.json`.
2. Rename `apps/devindex/resources/whitelist.json` to `allowlist.json`.
3. Update `config.paths` in `apps/devindex/services/config.mjs`.
4. Rename `getBlacklist`, `addToBlacklist`, and `getWhitelist` methods in `Storage.mjs`.
5. Update all usages across `Spider.mjs`, `Updater.mjs`, and `OptOut.mjs`.

## Timeline

- 2026-02-21T15:45:37Z @tobiu added the `enhancement` label
- 2026-02-21T15:45:37Z @tobiu added the `ai` label
- 2026-02-21T15:46:32Z @tobiu assigned to @tobiu
- 2026-02-21T15:46:49Z @tobiu referenced in commit `4c41c73` - "chore(devindex): Rename blacklist/whitelist to blocklist/allowlist (#9232)"
### @tobiu - 2026-02-21T15:46:58Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the rename refactoring across the DevIndex backend services.
> - `blacklist.json` -> `blocklist.json`
> - `whitelist.json` -> `allowlist.json`
> - Renamed all relevant variables, config paths, JSdoc strings, and methods (`getBlocklist`, `getAllowlist`, `addToBlocklist`) inside `config.mjs`, `Storage.mjs`, `Spider.mjs`, `Updater.mjs`, and `OptOut.mjs`.
> 
> Changes pushed to `dev`. Closing issue.

- 2026-02-21T15:47:17Z @tobiu closed this issue

