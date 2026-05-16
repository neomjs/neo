---
id: 9594
title: '[Bug] SSG Renderer Crash and Empty Folders for Recently Moved Tickets'
state: CLOSED
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-03-29T17:55:26Z'
updatedAt: '2026-03-29T18:14:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9594'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-29T18:14:03Z'
---
# [Bug] SSG Renderer Crash and Empty Folders for Recently Moved Tickets

When `fetchContent.mjs` ran during the SSR build process, it accurately synchronized the `issues` and `issue-archive` folders from the main repository. However, it failed to synchronize the `tickets.json` store file. Because `middleware-v2` consumes the `tickets.json` packaged within the published `neo.mjs` npm dependency (which may trail behind the main repository by hours or days), any recently archived tickets (e.g. #9484-#9491) were still pointing to the `issues/` path according to the outdated `tickets.json`. 

When the SSR renderer attempted to fetch these Markdown files from the `issues/` folder, it crashed with `ENOENT` because the updated `fetchContent.mjs` had physically placed them in `issue-archive/`. This crash caused the renderer to abort, leaving behind empty HTML directories for these ticket routes. 

**Solution:** Update `buildScripts/fetchContent.mjs` to dynamically pull the latest `tickets.json` and `releases.json` (from Portal `resources/data/`) from the cloned main repository alongside the Markdown files, guaranteeing absolute path consistency between the JSON data store and the physical file tree.

## Timeline

- 2026-03-29T17:55:27Z @tobiu added the `bug` label
- 2026-03-29T17:55:27Z @tobiu added the `ai` label
### @tobiu - 2026-03-29T18:14:02Z

Closed: Opened in the wrong repository (belongs to middleware-v2).

- 2026-03-29T18:14:03Z @tobiu closed this issue

