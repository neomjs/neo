---
id: 8458
title: Integrate Knowledge Base Upload into Publish Release Workflow
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-09T10:54:45Z'
updatedAt: '2026-01-09T10:57:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8458'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T10:57:28Z'
---
# Integrate Knowledge Base Upload into Publish Release Workflow

Integrate `buildScripts/uploadKnowledgeBase.mjs` into the `buildScripts/publishRelease.mjs` workflow.
This ensures the ChromaDB knowledge base artifact is automatically zipped and uploaded to every GitHub release.
Also remove the standalone `ai:upload-kb` script from `package.json` as it will be part of the automated process.

## Timeline

- 2026-01-09T10:54:46Z @tobiu added the `enhancement` label
- 2026-01-09T10:54:46Z @tobiu added the `ai` label
- 2026-01-09T10:54:46Z @tobiu added the `build` label
- 2026-01-09T10:55:41Z @tobiu referenced in commit `fa7a2d2` - "feat: Integrate knowledge base upload into release workflow (#8458)"
- 2026-01-09T10:55:44Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T10:55:50Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the integration of `uploadKnowledgeBase.mjs` into the `publishRelease.mjs` workflow.
> Removed the redundant `ai:upload-kb` script from `package.json`.
> The knowledge base upload will now occur automatically after the GitHub release is created.

- 2026-01-09T10:57:28Z @tobiu closed this issue

