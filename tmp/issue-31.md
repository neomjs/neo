---
id: 31
title: Fix Gemini settings file location
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-12-02T13:38:03Z'
updatedAt: '2025-12-02T13:40:15Z'
githubUrl: 'https://github.com/neomjs/create-app/issues/31'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T13:40:15Z'
---
# Fix Gemini settings file location

Update `tasks/createGeminiSettings.mjs` to write `settings.json` inside the `.gemini` folder.

**Correction:**
Change the write path to `path.join(folder, '.gemini/settings.json')`.

## Activity Log

- 2025-12-02 @tobiu added the `bug` label
- 2025-12-02 @tobiu assigned to @tobiu
- 2025-12-02 @tobiu referenced in commit `da8ca0b` - "Fix Gemini settings file location #31"
- 2025-12-02 @tobiu closed this issue

