# The GitHub Workflow Server

The **GitHub Workflow Server** (`neo.mjs-github-workflow`) acts as the Agent OS's "Executive Function." It bridges the gap between the local development environment and the remote GitHub repository, enabling "Local-First" project management.

## Purpose

Traditional agents rely on GitHub APIs to read issues and PRs. This is slow, rate-limited, and requires constant network access.
Our server transforms this workflow by implementing a **Bi-Directional Sync** system. It downloads issues and PRs as **local Markdown files**, allowing agents to:
*   Read tickets instantly (zero latency).
*   Search tickets using standard grep/find tools (or semantic search via Knowledge Base).
*   Modify tickets by editing text files.

## Markdown Synchronization

The server maintains a `.github/ISSUE` directory. Every issue in the repository is represented as a file:

```markdown
---
id: 7852
title: Documentation: Create Guide for "The GitHub Workflow Server"
state: OPEN
labels: [documentation, ai]
assignees: [tobiu]
---
# Description
Create a new guide...
```

*   **Pull:** The server periodically fetches changes from GitHub and updates the local files.
*   **Push:** When an agent (or user) modifies a local file (e.g., changing the description or adding a comment), the server detects the change and pushes it to GitHub.

## The Self-Organizing Archive

To keep the active workspace clean, the server implements an intelligent archive system.
*   **Active Issues:** Live in `.github/ISSUE/`.
*   **Closed Issues:** Are automatically moved to `.github/ISSUE_ARCHIVE/<ReleaseVersion>/`.

When a new release (e.g., `v11.8.0`) is published, all issues closed during that development cycle are automatically swept into the corresponding archive folder. This creates a permanent, versioned history of the project's work.

## Autonomous Agent Workflow

This infrastructure enables powerful autonomous behaviors:

### 1. Issue Triage
An agent can scan the `.github/ISSUE` directory, read the markdown content, and use the `add_labels` or `assign_issue` tools to organize incoming work.

### 2. Autonomous PR Reviews
The server provides specialized tools for Pull Requests:
*   `list_pull_requests`: See what's pending.
*   `get_pull_request_diff`: Read the code changes.
*   `create_comment`: Post a structured review.

**The "Review Loop":**
1.  Agent detects an open PR.
2.  Agent gets the diff and the conversation history.
3.  Agent checks out the PR branch locally (`checkout_pull_request`).
4.  Agent runs tests (`npm test`).
5.  Agent posts a review comment on GitHub detailing any findings.

This allows agents to act as "Level 1" maintainers, handling routine code reviews and verification automatically.
