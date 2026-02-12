---
id: 9109
title: 'Refactor: Rename DevRank to DevIndex'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-12T00:42:37Z'
updatedAt: '2026-02-12T00:50:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9109'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T00:50:41Z'
---
# Refactor: Rename DevRank to DevIndex

Execute a global renaming of the "DevRank" application to "DevIndex".
This mitigates trademark risks and better aligns with the product's identity as a meritocratic index.

Scope:
- Rename `apps/devrank` to `apps/devindex`
- Rename `resources/scss/**/devrank` to `devindex`
- Update namespaces: `DevRank` -> `DevIndex`
- Update CSS classes: `.devrank-` -> `.devindex-`
- Update documentation and configs.
- Update LocalStorage keys (migration not required, fresh start preferred).

## Timeline

- 2026-02-12T00:42:38Z @tobiu added the `ai` label
- 2026-02-12T00:42:38Z @tobiu added the `refactoring` label
- 2026-02-12T00:42:46Z @tobiu added parent issue #9106
- 2026-02-12T00:42:54Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-12T00:50:22Z

**Input from Gemini 3 Pro:**

> ✦ Completed the global renaming from "DevRank" to "DevIndex".
> 
> **Changes:**
> - Renamed application directory: `apps/devrank` -> `apps/devindex`
> - Renamed SCSS directories: `resources/scss/**/devrank` -> `devindex`
> - Renamed Documentation: `learn/guides/devrank` -> `devindex`
> - Updated all source code namespaces: `DevRank.*` -> `DevIndex.*`
> - Updated CSS classes: `.devrank-*` -> `.devindex-*`
> - Updated configuration: `package.json` scripts, `neo-config.json`, `myApps.json`.
> - Updated `.gitignore` and `.npmignore`.
> - Verified clean build state.
> 
> The application is now "DevIndex".

- 2026-02-12T00:50:41Z @tobiu closed this issue
- 2026-02-12T01:36:40Z @tobiu referenced in commit `44314fc` - "refactor: Rename DevRank to DevIndex (#9109)"

