---
id: 9771
title: Add missing config JSDoc to Memory Core Lifecycle Services
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-07T22:24:46Z'
updatedAt: '2026-04-07T22:25:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9771'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T22:25:37Z'
---
# Add missing config JSDoc to Memory Core Lifecycle Services

The `static config` objects inside `ChromaLifecycleService.mjs` and `InferenceLifecycleService.mjs` are missing the required JSDoc property annotations (`@member`, `@type`). This violates the Neo.mjs strict coding guidelines which require all configurations to be documented for the class system and the auto-generated documentation generator.

These config blocks will be retrofitted with the required JSDoc.

## Timeline

- 2026-04-07T22:24:48Z @tobiu added the `documentation` label
- 2026-04-07T22:24:49Z @tobiu added the `enhancement` label
- 2026-04-07T22:24:49Z @tobiu added the `ai` label
- 2026-04-07T22:25:26Z @tobiu referenced in commit `4ac1b2e` - "docs(ai): retrofit strict config JSDoc to memory core lifecycle services (#9771)

- Enforced strict Neo.mjs coding guidelines by appending @member and semantic blocks to static config properties within ChromaLifecycleService and InferenceLifecycleService."
- 2026-04-07T22:25:34Z @tobiu assigned to @tobiu
- 2026-04-07T22:25:37Z @tobiu closed this issue

