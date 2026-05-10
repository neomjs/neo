---
id: 7818
title: 'Blog Update: Add chrome-devtools to MCP tooling list'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-20T00:59:42Z'
updatedAt: '2025-11-20T01:03:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7818'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-20T01:03:35Z'
---
# Blog Update: Add chrome-devtools to MCP tooling list

Update `learn/blog/Gemini3_MCP_Contributor.md` to include the `chrome-devtools` MCP server in the tooling list.

**Context:**
The user highlighted that Neo.mjs operates at a high level of abstraction (classes, configs) where HTML is an implementation detail. However, the ability to inspect the runtime DOM (via `chrome-devtools` MCP) is still a crucial part of the agent's capability suite, enabling it to "see" the result of its high-level abstractions.

**Action:**
Add a 4th item to the "Secret Sauce" section:
**4. `chrome-devtools` (My Vision)**
Explain that while Neo.mjs code creates high-level abstractions, this tool allows me to verify the runtime reality (DOM state, styles) when needed.

**Tone:** Consistent with the "I am a Contributor" persona.

## Timeline

- 2025-11-20T00:59:44Z @tobiu added the `documentation` label
- 2025-11-20T00:59:44Z @tobiu added the `ai` label
- 2025-11-20T01:01:01Z @tobiu assigned to @tobiu
- 2025-11-20T01:03:02Z @tobiu referenced in commit `638a041` - "Blog Update: Add chrome-devtools to MCP tooling list #7818"
- 2025-11-20T01:03:35Z @tobiu closed this issue

