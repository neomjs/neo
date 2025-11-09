---
id: 7622
title: Create MCP Tool for GitHub Issue Creation
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-23T14:11:44Z'
updatedAt: '2025-10-23T14:12:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7622'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-23T14:12:50Z'
---
# Create MCP Tool for GitHub Issue Creation

**Reported by:** @tobiu on 2025-10-23

The current workflow of creating local ticket files before creating a corresponding GitHub issue is fundamentally flawed. We cannot predict the issue number that GitHub will assign, which can lead to race conditions and conflicts if other issues or pull requests are created on GitHub in the meantime. This makes local file naming and cross-linking unreliable.

To solve this, we need to reverse the process. A new tool will be responsible for creating the issue directly on GitHub to obtain a canonical ID and URL. The corresponding local Markdown file will then be created and populated by the existing `sync_all` tool on its next run.

### Proposed Solution

Create a new tool for the `github-workflow` MCP server that handles the creation of GitHub issues. This tool will be the authoritative first step for creating new tickets for the project.

**Tool Requirements:**

1.  **Inputs:** The tool must accept the following parameters:
    *   `title` (string, required): The title of the issue.
    *   `body` (string, optional): The Markdown content for the issue body.
    *   `labels` (string[], optional): An array of label names to assign to the new issue.

2.  **Implementation:**
    *   The tool should leverage the `gh` CLI, which is already a dependency of the workflow server.
    *   It will use the `gh issue create` command.
    *   The existing script at `buildScripts/ai/createGhIssue.mjs` can serve as a reference for the basic logic of calling the `gh` command with a title and body.
    *   Crucially, the new implementation must add support for the `--label` flag to handle the `labels` input. The flag can be passed multiple times for multiple labels.

3.  **Outputs:** Upon successful creation, the tool should return a JSON object containing:
    *   `issueNumber` (number): The number of the newly created GitHub issue.
    *   `url` (string): The URL of the newly created GitHub issue.

This new, two-step workflow (`create_issue` then `sync_all`) will be a reliable, atomic process for issue creation, eliminating the problems of the local-first approach.

