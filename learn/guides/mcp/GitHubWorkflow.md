# The GitHub Workflow Server

The **GitHub Workflow Server** (`neo.mjs-github-workflow`) acts as the Agent OS's "Executive Function." It bridges the gap between the local development environment and the remote GitHub repository, enabling a "Local-First" project management philosophy.

## 1. Purpose: Context Engineering

Traditional autonomous agents rely heavily on GitHub APIs to read issues and Pull Requests (PRs). This is fragile, slow, and context-poor. An agent has to "ask" for information (via API) rather than "having" it.

This server transforms the workflow by implementing **Context Engineering**: giving the agent the precise, queryable, and persistent context it needs to be a true partner. By synchronizing issues and PRs as **local Markdown files** via a robust **Bi-Directional Sync** system, we enable:

*   **Three-Dimensional Context:**
    1.  **History:** The `git` log provides the code's timeline.
    2.  **Requirements:** The local tickets provide the formal plan and acceptance criteria.
    3.  **Intent:** The agent's own Memory Core provides the reasoning behind past decisions.
*   **Zero-Latency Access:** Agents can read, search, and cross-reference tickets instantly without API round-trips.
*   **Semantic Intelligence:** The local markdown files are automatically indexed by the **Knowledge Base Server** (`neo.mjs-knowledge-base`). This enables **semantic vector search**, allowing agents to query tickets by *meaning* (e.g., "find past VDOM regressions") rather than just keywords.
*   **Platform Independence:** Your project management data lives in your repo, not just on GitHub's servers.

## 2. Real-World Use Case: The Autonomous Review Loop

The true power of this server is best understood through the "Autonomous Review Loop." This workflow removes the human maintainer as a bottleneck for routine code reviews.

### The Workflow

1.  **Discovery:** The agent uses **`list_pull_requests`** to find open PRs.
2.  **Context Gathering:**
    *   It reads the conversation history with **`get_conversation`**.
    *   It analyzes the code changes with **`get_pull_request_diff`**.
    *   If needed, it checks out the branch locally with **`checkout_pull_request`** to run tests (`npm test`).
3.  **Analysis & Review:** The agent synthesizes this information to form a review.
4.  **Participation:** The agent posts a structured review comment using **`create_comment`**.

### Visualizing the Agent's Voice

When an agent posts a comment, the server automatically formats it with an "Agent Header" to ensure transparency and clear attribution:

> **Input from Gemini 2.5 Pro:**
>
> ### ✦ Code Review Findings
>
> I've analyzed the changes in this PR and found the following:
>
> 1. **Line 47**: The null check should be moved before the dereference
> 2. **Tests**: The edge case for empty arrays is not covered

This clear distinction between human and AI input is a core part of the server's design.

## 3. Architecture

The server is built on a robust service layer that orchestrates the flow of data between the local file system and GitHub.

### 3.1 Service Layer

The application logic is distributed across specialized services, all extending `Neo.core.Base`:

*   **`SyncService` (The Conductor):** The central singleton that coordinates the entire synchronization process. It manages the dependencies between fetching releases, archiving issues, pushing local changes, and pulling remote updates.
*   **`IssueSyncer`:** Handles the heavy lifting of converting between GitHub GraphQL nodes and local Markdown. It implements:
    *   **Content Hashing:** To detect actual changes and prevent unnecessary writes.
    *   **Markdown Formatting:** converting JSON data into frontmatter-enriched Markdown.
    *   **Archive Logic:** Determining the correct path for closed issues based on release dates.
*   **`ReleaseSyncer`:** Fetches GitHub Releases and synchronizes their release notes to `.github/RELEASE_NOTES/`. This data is crucial for the "Self-Organizing Archive."
*   **`MetadataManager`:** Manages the persistent state (`.github/.sync-metadata.json`). It tracks content hashes, file paths, and timestamps to ensure efficient delta updates.
*   **`GraphqlService`:** A centralized wrapper around the GitHub GraphQL API. It handles authentication via the `gh` CLI, token caching, and executes complex queries defined in `services/queries/`.
*   **`HealthService`:** Acts as a gatekeeper, ensuring the `gh` CLI is installed, authenticated, and up-to-date. It implements intelligent caching (5-minute TTL for healthy results) to minimize overhead.

### 3.2 The Bi-Directional Sync Workflow

The core of the server is its ability to maintain state consistency between the local filesystem and GitHub. This isn't just downloading files; it's a true two-way synchronization engine:

*   **Push (Local → Remote):** The server scans for modified local Markdown files. It uses **Content Hashing** (SHA-256) to detect actual changes. If a file has changed, the server pushes updates (Title, Body) to GitHub via GraphQL mutations.
*   **Pull (Remote → Local):** The server fetches the latest data from GitHub. New issues are created locally, and updated issues overwrite local versions.

When `sync_all` is called, `SyncService` executes a precise 8-step orchestration logic to ensure data integrity:

1.  **Load Metadata:** Reads `.sync-metadata.json` to understand the previous state.
2.  **Fetch Releases:** `ReleaseSyncer` fetches the latest release data. This is done *first* because the archive logic depends on knowing available releases.
3.  **Reconcile Archives:** `IssueSyncer` scans the active `.github/ISSUE` directory for closed issues. It compares their `closedAt` date with release dates to move them to the correct archive folder (e.g., `.github/ISSUE_ARCHIVE/v10.5.0/`).
4.  **Push Local Changes:** `IssueSyncer` scans the active directory for modified Markdown files. It compares content hashes with the metadata. If changed, it pushes updates (title, body) to GitHub via the `UPDATE_ISSUE` GraphQL mutation.
5.  **Pull Remote Changes:** `IssueSyncer` executes the `FETCH_ISSUES_FOR_SYNC` GraphQL query. This powerful query fetches issues, comments, labels, assignees, and relationships in a single request. New issues are created locally; updated issues are overwritten.
6.  **Sync Release Notes:** `ReleaseSyncer` writes release notes to `.github/RELEASE_NOTES/`, ensuring the local documentation matches GitHub.
7.  **Self-Heal:** The system checks for and clears any resolved push failures from the metadata.
8.  **Save Metadata:** The new state, including updated content hashes and timestamps, is persisted to disk.

## 4. The Toolset

The server exposes a comprehensive suite of tools via the Model Context Protocol (MCP), mapped directly to service methods.

### 4.1 Synchronization & Health

*   **`sync_all`**: Triggers the full bi-directional sync workflow described above.
*   **`healthcheck`**: Verifies `gh` CLI status. Returns cached healthy results for speed, but performs immediate checks if the system was previously unhealthy.
*   **`get_viewer_permission`**: Returns the bot's permission level (`ADMIN`, `WRITE`, `READ`).

### 4.2 Issue Management

*   **`create_issue`**: **Authoritative** tool for creating tickets. Uses `gh issue create`.
*   **`list_issues`**: Lists issues with filtering. Uses client-side filtering for labels/assignees to reduce API complexity.
*   **`get_local_issue_by_id`**: Fast, offline retrieval of an issue's full Markdown content from the local file system.
*   **`add_labels` / `remove_labels`**: Manages labels via GraphQL mutations.
*   **`assign_issue` / `unassign_issue`**: Manages user assignments. Requires `WRITE` permission.
*   **`update_issue_relationship`**: Configures parent-child (Epic) or blocked-by dependencies using GraphQL mutations (`ADD_SUB_ISSUE`, `ADD_BLOCKED_BY`, etc.).

### 4.3 Pull Request Management

*   **`list_pull_requests`**: Lists PRs with status filtering.
*   **`checkout_pull_request`**: Checks out a PR branch locally using `gh pr checkout`.
*   **`get_pull_request_diff`**: Fetches the code difference via `gh pr diff`.
*   **`get_conversation`**: Retrieves the full PR discussion history using the `GET_CONVERSATION` GraphQL query.
*   **`create_comment`**: Posts a new comment to a PR or Issue. Supports "Agent Headers" to identify which AI identity is speaking.
*   **`update_comment`**: Edits an existing comment.

### 4.4 Discovery

*   **`list_labels`**: Enumerates all valid labels in the repository. *Always check this before applying labels.*

## 5. Configuration

The server is highly configurable via `config.mjs` or a custom configuration file passed via the `-c` or `--config` CLI flag. This allows you to override default settings—such as the target repository, file paths, or API limits—without modifying the source code.

### Usage

```bash readonly
node ai/mcp/server/github-workflow/mcp-stdio.mjs -c ./my-config.json
```

### Configuration File Format

You can provide a JSON file or an ES Module (`.mjs`) that exports a configuration object. The custom configuration is deep-merged with the default settings.

**Example `my-config.json`:**

```json readonly
{
    "owner": "my-org",
    "repo": "my-project",
    "debug": true,
    "issueSync": {
        "syncStartDate": "2024-01-01T00:00:00Z",
        "droppedLabels": ["wontfix", "duplicate", "spam"]
    },
    "pullRequest": {
        "defaults": {
            "limit": 10
        }
    }
}
```

This flexibility is crucial for:
*   **Multi-Repo Support:** Quickly switching the server context between different projects.
*   **Performance Tuning:** Adjusting `maxIssues` or GraphQL limits based on your network or token constraints.
*   **Environment Specifics:** Using different directory structures for testing versus production.

## 6. Data Structures

### The Directory Structure

*   **`.github/ISSUE/`**: The "Active Workspace." Contains all open tickets as Markdown files.
*   **`.github/ISSUE_ARCHIVE/`**: The "Historical Record." Contains closed tickets, organized by Release Version (e.g., `v5.0.0/`).
*   **`.github/RELEASE_NOTES/`**: Contains the content of GitHub Releases.

### The Markdown Format

Each issue is stored as a YAML-frontmatter Markdown file. The frontmatter contains rich metadata derived from the GraphQL response:

```markdown readonly
---
id: 7852
title: Documentation: Create Guide for "The GitHub Workflow Server"
state: OPEN
labels: [documentation, ai]
assignees: [tobiu]
author: tobiu
createdAt: 2025-10-26T10:00:00Z
updatedAt: 2025-10-26T12:00:00Z
parentIssue: 7850
subIssues: [7855, 7856]
blockedBy: []
---
# Description
Create a new guide...

## Comments

### @tobiu - 2025-10-26 12:05
This looks correct.
```

### The Metadata Cache

Stored at `.github/.sync-metadata.json`, this file allows the server to perform "delta syncs." It tracks:
*   **`contentHash`**: SHA-256 hash of the Markdown content to detect local modifications.
*   **`updatedAt`**: Timestamp of the last update from GitHub to detect remote changes.
*   **`path`**: The current file path, allowing the system to track moves (e.g., archiving).

## 7. Platform Independence & Vendor Lock-In

The GitHub Workflow Server's local-first architecture isn't just about performance—it's about **sovereignty**.

Git repositories, by default, do not contain issues, pull request conversations, or release notes. These critical project artifacts live inside GitHub's proprietary database. This creates significant vendor lock-in. If GitHub (owned by Microsoft) changes its terms, pricing, or strategic direction—such as moving infrastructure to Azure or restricting AI access—your project management data is trapped.

Our architecture solves this by treating **GitHub as a sync target, not the source of truth.**

Because every issue and release note is stored as a standard Markdown file **inside your git repository**:
1.  **Migration is Feasible:** Moving to GitLab, Gitea, or a custom solution becomes a matter of writing a new sync adapter. Your data is already in a portable format.
2.  **Data is Yours:** You have a complete, offline, version-controlled backup of your project's history.
3.  **Workflow Continuity:** If the remote platform goes down, your agents (and you) can continue to read, search, and modify tickets locally.

This aligns with the broader Agent OS philosophy: build tools that empower the user and ensure long-term resilience.
