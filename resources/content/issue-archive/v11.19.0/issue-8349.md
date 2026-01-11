---
id: 8349
title: Move sync_knowledge_base.mjs to buildScripts/syncKnowledgeBase.mjs
state: CLOSED
labels:
  - refactoring
  - build
assignees:
  - tobiu
createdAt: '2026-01-06T10:47:12Z'
updatedAt: '2026-01-06T10:49:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8349'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T10:49:13Z'
---
# Move sync_knowledge_base.mjs to buildScripts/syncKnowledgeBase.mjs

Move the knowledge base synchronization script from `ai/examples/sync_knowledge_base.mjs` to `buildScripts/syncKnowledgeBase.mjs` to better reflect its role as a repository utility rather than just an example.

**Tasks:**
1.  Rename and move `ai/examples/sync_knowledge_base.mjs` to `buildScripts/syncKnowledgeBase.mjs`.
2.  Update the import paths in the moved file to correctly resolve from the new location.
3.  Update the `ai:sync-kb` script in `package.json`.

## Timeline

- 2026-01-06T10:47:14Z @tobiu added the `refactoring` label
- 2026-01-06T10:47:14Z @tobiu added the `build` label
- 2026-01-06T10:47:30Z @tobiu assigned to @tobiu
- 2026-01-06T10:48:53Z @tobiu referenced in commit `3fad21c` - "Move sync_knowledge_base.mjs to buildScripts/syncKnowledgeBase.mjs #8349"
### @tobiu - 2026-01-06T10:48:58Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully moved the synchronization script to `buildScripts/`.
> 
> **Changes Implemented:**
> 1.  **Moved:** `ai/examples/sync_knowledge_base.mjs` -> `buildScripts/syncKnowledgeBase.mjs`.
> 2.  **Updated Imports:** Adjusted relative paths in `buildScripts/syncKnowledgeBase.mjs` to point to the correct `src` and `ai` directories.
> 3.  **Updated Config:** Modified `package.json` so the `ai:sync-kb` script now runs `node ./buildScripts/syncKnowledgeBase.mjs`.
> 
> **Verification:**
> Executed `npm run ai:sync-kb`. The script ran successfully, initializing services, creating the knowledge base file, and performing the embedding process without errors.
> 
> The synchronization logic is now correctly categorized as a build utility.

- 2026-01-06T10:49:13Z @tobiu closed this issue

