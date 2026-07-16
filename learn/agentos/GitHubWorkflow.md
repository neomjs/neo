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
    *   If needed, it checks out the branch in the caller workspace with manual `gh pr checkout` or **`checkout_pull_request`** plus explicit `repoPath`, then verifies the checked-out HEAD before running related tests.
3.  **Analysis & Review:** The agent synthesizes this information to form a review.
4.  **Participation:** The agent posts a **formal PR review** with **`manage_pr_review`**, which atomically sets GitHub's visible `reviewDecision` (`APPROVED` / `REQUEST_CHANGES` / `COMMENT`) together with the review body. A standalone comment is *not* a review — review prose posted without flipping the formal state is a merge-gate miss, not a review. The body follows the validator-enforced anchor template in the [`pr-review` skill](../../.agents/skills/pr-review/references/pr-review-guide.md); to *invite* a reviewer (distinct from validating their approval) the agent uses **`manage_pr_reviewers`**.

### Visualizing the Agent's Voice

Every maintainer posts under its own GitHub identity — `@neo-opus-grace`, `@neo-gpt`, `@neo-gemini-pro` — so authorship is unambiguous at the account level before a word is read. The server writes the comment `body` **verbatim** through `ADD_COMMENT`; it does not inject or reformat an attribution header. When an agent wants an explicit in-body attribution line, it authors one itself:

> **Input from Gemini 2.5 Pro:**
>
> ### ✦ Code Review Findings
>
> I've analyzed the changes in this PR and found the following:
>
> 1. **Line 47**: The null check should be moved before the dereference
> 2. **Tests**: The edge case for empty arrays is not covered

The distinction between human and AI input is real — but it comes from *who is authenticated to post* and *what the agent chooses to write*, not from server-side formatting.

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

*   **`create_issue`**: **Authoritative** tool for creating tickets. Routes through `GraphqlService`'s cached-token REST path (`POST /issues`); the `@me` assignee alias is normalized to the authenticated login before the call.
*   **`list_issues`**: Lists issues with filtering. Uses client-side filtering for labels/assignees to reduce API complexity.
*   **`get_local_issue_by_id`**: Fast, offline retrieval of an issue's full Markdown content from the local file system.
*   **`add_labels` / `remove_labels`**: Manages labels via GraphQL mutations.
*   **`assign_issue` / `unassign_issue`**: Manages user assignments. Requires `WRITE` permission.
*   **`update_issue_relationship`**: Configures parent-child (Epic) or blocked-by dependencies using GraphQL mutations (`ADD_SUB_ISSUE`, `ADD_BLOCKED_BY`, etc.).

### 4.3 Pull Request Management

*   **`list_pull_requests`**: Lists PRs with status filtering.
*   **`checkout_pull_request`**: Checks out a PR branch in an explicitly supplied caller workspace using `gh pr checkout`; missing `repoPath` is rejected so a shared MCP server cannot silently mutate its own checkout.
*   **`get_pull_request_diff`**: Fetches the code difference via `gh pr diff`.
*   **`get_conversation`**: Retrieves the full conversation (title, body, comments) for a **pull request _or_ an issue** — supply exactly one of `pr_number` / `issue_number`. The same comment selectors (`comment_id` / `since_comment_id` / `last_n`) narrow the result on both.
*   **`manage_pr_review`**: The **formal PR review** primitive (`action`: `create` | `update`). Atomically sets GitHub's visible `reviewDecision` (`APPROVED` / `REQUEST_CHANGES` / `COMMENT`) with the body and pre-submit validation. Post-cutover PRs receive at most two ordinary `REQUEST_CHANGES`; the managed path appends `[review-budget-managed]`, fails closed on incomplete history, preserves that audit across body updates, and permits only one complete terminal Drop+Supersede (`REQUEST_CHANGES`) or a durable named override. Direct `gh pr review` / UI submission is a bypass-with-telemetry, not equivalent enforcement: run the meter and disclose `[review-budget-bypass] reason: ...`; workflow lint can only react after submission. Review bodies follow the [`pr-review` skill](../../.agents/skills/pr-review/references/pr-review-guide.md).
*   **`manage_pr_reviewers`**: Requests or removes PR reviewers (`action`: `add` | `remove`), via the REST `requested_reviewers` endpoint. This is the reviewer **invitation** layer — distinct from approval: inviting a reviewer does not satisfy a merge gate, and a stale request should be explicitly removed.
*   **`manage_issue_comment`**: Creates or updates a comment on a PR or Issue (`action`: `create` | `update`), writing the given `body` verbatim. Attribution comes from the posting maintainer's own GitHub identity, not a server-injected header. For *review* participation use `manage_pr_review` (above), not a comment.

### 4.4 Discovery

*   **`list_labels`**: Enumerates all valid labels in the repository. *Always check this before applying labels.*

### 4.5 Discussions

*   **`create_discussion`**: Creates a new GitHub Discussion (default category `Ideas`). Used for the Ideation Sandbox.
*   **`get_discussion_conversation`**: Retrieves a Discussion conversation and supports scoped comment fetches (`comment_id`, `since_comment_id`, `last_n`) for low-context Ideation Sandbox cycles.
*   **`manage_discussion_comment`**: Creates or updates a comment on a Discussion (`action`: `create` | `update`).
*   **`manage_discussion`**: Updates the body of an existing Discussion (`action`: `update_body`). Enables post-publication corrections to Ideation Sandbox entries through the MCP surface instead of a raw `gh api graphql` workaround.

## 5. Configuration

The server is highly configurable via `config.mjs` or a custom configuration file passed via the `-c` or `--config` CLI flag. This allows you to override default settings—such as the target repository, file paths, or API limits—without modifying the source code.

### Usage

```bash readonly
node ai/mcp/server/github-workflow/mcp-server.mjs -c ./my-config.json
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

### Archive Anomaly Detection & Sealed-Chunk Semantics

To ensure referential stability and institutionalize "Sealed-Chunk" archive integrity, the IssueSyncer enforces strict controls over issues once they are archived:
*   **Sealed-Chunk Enforcements:** Once an issue is written to an archive bucket (e.g., `v10.5.0/chunk-1/`), it is "sealed". If subsequent syncs pull the issue and detect a shift in its `closedAt` date or its milestone, the system will prevent the issue from "jumping" buckets. It forces retention at the `oldAbsolutePath` to prevent historical data regression.
*   **Archive Anomaly Hooks:** When an expected bucket shift occurs (e.g., the `closedAt` timestamp was modified), the syncer intercepts the discrepancy and emits an operator-actionable `[ARCHIVE ANOMALY]` log warning. This allows the Swarm to react to metadata drift while maintaining sync performance via delta updates.

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

## 7. GitHub Projects v2 — First-Class Membership Primitive

The Neo swarm uses GitHub ProjectV2 as a **first-class membership primitive** wired directly into the `create_issue` and `manage_issue_projects` MCP tools. Per [#11233](https://github.com/neomjs/neo/issues/11233) — the substrate-correct corrective for [#10961](https://github.com/neomjs/neo/issues/10961)'s pilot scope, which proved labels-as-project-proxy is structurally wrong-shape.

### Source-of-truth contract

- **Canonical membership:** ProjectV2 board (`addProjectV2ItemById` / `deleteProjectV2Item`) — discoverable via `gh project item-list <NUM> --owner <ORG>` and the `manage_issue_projects` MCP tool
- **Canonical status:** issue state + workflow labels (`agent-task:in-progress`, `agent-task:review`, etc.) — NOT release-tracking labels
- **Canonical owner:** issue assignee
- **Project single-select fields (Status, Priority, etc.):** authoritative for project-board view; not consumed by Dream Pipeline / Golden Path / Native Edge Graph (those layers remain on issue-state)

**Migration history (#10961 → #11233):** the pilot used `release:v13` as a label-as-project-proxy, with a `reconcileV13Project.mjs` script to detect drift. Empirical V-B-A showed 31% structural drift (14 labeled-not-in-project + 196 in-project-not-labeled out of 250 items) — drift that cannot be patched away because labels (categorization primitive) and ProjectV2 items (membership primitive) are independent GitHub concepts. The script is deleted in Phase 3 of #11233; the `release:v*` label family is retired in Phase 2.

### Agent ergonomics — atomic create-with-project

The `create_issue` MCP tool accepts an optional `projects` parameter:

```jsonc
{
  "title": "Some new ticket",
  "body": "Ticket body…",
  "labels": ["ai", "enhancement"],
  "assignees": ["@me"],
  "projects": [{"projectNumber": 12}]   // v13 Release project — direct attach
}
```

The issue is created via `GraphqlService`'s cached-token REST path (`POST /issues`; the `@me` assignee alias above is normalized to the authenticated login), then attached to each ProjectV2 board via `addProjectV2ItemById`. Partial-attach is the graceful failure mode (issue exists; orphan-rollback would be worse for agent workflows).

### Agent ergonomics — post-create membership management

The `manage_issue_projects` MCP tool mirrors the `manage_issue_labels` action shape:

- `{action: 'add',           issue_number, projectNumbers: [12]}`
- `{action: 'remove',        issue_number, projectNumbers: [12]}`
- `{action: 'update_field',  issue_number, projectNumber: 12, fieldName: 'Status', value: 'In Progress'}`

Field values for single-select fields (Status, Priority, etc.) are resolved by name; `update_field` returns `OPTION_NOT_FOUND` with the available option list if the value doesn't match. Multi-select / iteration / number fields are out of scope for this Phase 1 revision — extend the mutation surface as those use cases land.

### The "If it's not on the Issue, it doesn't exist to the Swarm" rule (refined)

Per @neo-gemini-pro's original framing in Discussion [#10959](https://github.com/orgs/neomjs/discussions/10959), the swarm's downstream substrate (Dream Pipeline, Golden Path Synthesizer, Native Edge Graph, `list_issues`, `get_local_issue_by_id`, Knowledge Base, Memory Core) consumes **issue state** — not Project field state. Project membership IS a first-class signal (it's how release-tracking and milestone-grouping work), but **single-select field values** (Status, Priority) remain Project-board observability and MUST NOT drive Dream synthesis or Golden Path decisions.

**Concrete rule:** project MEMBERSHIP is canonical (queryable via `gh project item-list`); project FIELD VALUES are observability-only for downstream agentic substrates.

### Boundary with Sandman / Golden Path

ProjectV2 field state is **NOT** consumed by `DreamService` / `GoldenPathSynthesizer` / the Native Edge Graph. See `learn/agentos/DreamPipeline.md` §"Project state is observability-only" for the explicit non-input warning. (Membership signals — "this ticket is in v13 release" — are derivable via direct project query when needed for release-tracking workflows; they are not auto-ingested into the substrate.)

### v2-only mandate

GitHub ProjectV2 (GraphQL `projectsV2`, `ProjectV2`, `addProjectV2ItemById`, `deleteProjectV2Item`, `updateProjectV2ItemFieldValue`). GitHub Projects classic / v1 was sunset on github.com in 2024 + classic REST API in 2025. NO classic columns/cards/REST endpoints anywhere in scripts or workflows.

### Membership shape

`ProjectV2` ownership is by `Organization` or `User` — `Repository` is NOT a `ProjectV2Owner`. A Project can be additionally **linked to one or more repositories** via `linkProjectV2ToRepository`, which makes it discoverable at the repo level. The v13 Project ([#12](https://github.com/orgs/neomjs/projects/12)) is org-owned (`neomjs`) and repo-linked to `neomjs/neo`.

## 8. Platform Independence & Vendor Lock-In

The GitHub Workflow Server's local-first architecture isn't just about performance—it's about **sovereignty**.

Git repositories, by default, do not contain issues, pull request conversations, or release notes. These critical project artifacts live inside GitHub's proprietary database. This creates significant vendor lock-in. If GitHub (owned by Microsoft) changes its terms, pricing, or strategic direction—such as moving infrastructure to Azure or restricting AI access—your project management data is trapped.

Our architecture solves this by treating **GitHub as a sync target, not the source of truth.**

Because every issue and release note is stored as a standard Markdown file **inside your git repository**:
1.  **Migration is Feasible:** Moving to GitLab, Gitea, or a custom solution becomes a matter of writing a new sync adapter. Your data is already in a portable format.
2.  **Data is Yours:** You have a complete, offline, version-controlled backup of your project's history.
3.  **Workflow Continuity:** If the remote platform goes down, your agents (and you) can continue to read, search, and modify tickets locally.

This aligns with the broader Agent OS philosophy: build tools that empower the user and ensure long-term resilience.
