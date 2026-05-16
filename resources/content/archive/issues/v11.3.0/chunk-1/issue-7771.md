---
id: 7771
title: 'docs(llms.txt): Enhance description for environment URLs'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-13T22:52:43Z'
updatedAt: '2025-11-13T22:54:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7771'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-13T22:54:46Z'
---
# docs(llms.txt): Enhance description for environment URLs

### Description

The `llms.txt` file provides content for LLMs, and it currently lists only the zero-builds development mode URLs for applications and examples. However, Neo.mjs applications and examples are deployed across four distinct environments (development mode, `dist/development`, `dist/esm`, and `dist/production`), all serving identical functionality through different code delivery methods.

To provide better context for LLMs and clarify the canonical URL strategy, the introductory description within `llms.txt` needs to be enhanced.

### Goal

Update the introductory description in `apps/portal/llms.txt` to:
1.  Explain that Neo.mjs applications and examples are available in four equivalent environments.
2.  Clarify that the URLs listed in `llms.txt` are specifically the development mode (zero-builds) versions.
3.  Provide instructions on how to access other environment versions (e.g., by prefixing the path with `/dist/production/`).
4.  Include a specific example for the Portal app, showing its various environment URLs and the root domain mapping.

### Implementation Status

The necessary changes to the `getLlmsTxt` function in `buildScripts/generateSeoFiles.mjs` to update this description have already been implemented. This ticket serves to track the completion and verification of this documentation enhancement.

## Timeline

- 2025-11-13T22:52:44Z @tobiu added the `documentation` label
- 2025-11-13T22:52:44Z @tobiu added the `ai` label
- 2025-11-13T22:53:52Z @tobiu assigned to @tobiu
- 2025-11-13T22:54:41Z @tobiu referenced in commit `bcaf2d9` - "docs(llms.txt): Enhance description for environment URLs #7771"
- 2025-11-13T22:54:46Z @tobiu closed this issue

