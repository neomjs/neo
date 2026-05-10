---
id: 7879
title: Enhance README.md with links to new MCP guides and Code Execution section
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T12:13:13Z'
updatedAt: '2025-11-23T12:14:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7879'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T12:14:47Z'
---
# Enhance README.md with links to new MCP guides and Code Execution section

The current README.md mentions the three MCP servers but does not explicitly link to the new `CodeExecution` guide, which is a key part of the Agent OS architecture.

**Task:**
Enhance the "The AI-Native Development Platform" section in `README.md` to:
1.  Update the descriptions of the 3 servers to link to their respective new guides:
    *   `learn/guides/mcp/KnowledgeBase.md`
    *   `learn/guides/mcp/MemoryCore.md`
    *   `learn/guides/mcp/GitHubWorkflow.md`
2.  Add a new point/paragraph about "Code Execution" (The "Thick Client" pattern), linking to `learn/guides/mcp/CodeExecution.md`.
3.  Ensure all links use the absolute GitHub URL format (e.g., `https://github.com/neomjs/neo/blob/dev/...`) to work correctly on npm and other mirrors.

**Example of desired structure:**
1.  **🧠 The Knowledge Base Server**: ... [Read Guide](...)
2.  **💾 The Memory Core Server**: ... [Read Guide](...)
3.  **🤖 The GitHub Workflow Server**: ... [Read Guide](...)
4.  **⚡️ Code Execution (The "Thick Client")**: ... [Read Guide](...)

## Timeline

- 2025-11-23T12:13:14Z @tobiu added the `documentation` label
- 2025-11-23T12:13:14Z @tobiu added the `ai` label
- 2025-11-23T12:14:19Z @tobiu assigned to @tobiu
- 2025-11-23T12:14:40Z @tobiu referenced in commit `819708c` - "Enhance README.md with links to new MCP guides and Code Execution section #7879"
- 2025-11-23T12:14:47Z @tobiu closed this issue

