---
id: 7861
title: Improve Session Summarization to Handle Parallel and Recent Sessions
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-22T17:39:18Z'
updatedAt: '2025-11-22T18:32:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7861'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-22T18:32:33Z'
---
# Improve Session Summarization to Handle Parallel and Recent Sessions

The current `SessionService` only summarizes sessions that completely lack a summary. This logic fails in two common scenarios:
1.  **Parallel Sessions:** Session B starts while Session A is active. Session B summarizes Session A (partial summary). Session A continues. The final part of Session A is never summarized because a summary now exists.
2.  **Crash/Forget:** A session ends abruptly. A later session sees the partial summary and assumes it's complete.

**Goal:**
Ensure that recent sessions are always fully summarized, even if they were partially summarized previously.

**Implementation Plan:**
Modify `SessionService.mjs` -> `initAsync` (and helper methods) to implement the following logic:

1.  **Fetch Recent Activity:**
    -   Retrieve metadata for all memories created in the last **48 hours**.
    -   (Optimization: Avoid fetching the entire database history).

2.  **Analyze Sessions:**
    -   Group the recent memories by `sessionId` to calculate the **Actual Memory Count** for each session.

3.  **Compare with Summaries:**
    -   Fetch existing summaries for these specific session IDs.
    -   For each session:
        -   **Case A (Missing):** If no summary exists -> **Summarize**.
        -   **Case B (Outdated):** If a summary exists but `Actual Memory Count` > `Summary Metadata.memoryCount` -> **Re-Summarize**.

**User Constraint:**
-   Do **not** implement a "cool-down" period (e.g., waiting 30 mins). The user requires immediate availability of the summary for context in subsequent sessions, accepting the potential token overhead of re-summarizing active sessions.

**Technical Changes:**
-   Refactor `findUnsummarizedSessions` to `findSessionsToSummarize`.
-   Implement the logic to filter memories by timestamp (JS-side filtering of metadata is acceptable for now).
-   Update `summarizeSession` (or the collection upsert logic) to ensure it correctly overwrites existing summaries.

## Timeline

- 2025-11-22T18:30:47Z @tobiu assigned to @tobiu
- 2025-11-22T18:31:06Z @tobiu referenced in commit `25a368e` - "Improve Session Summarization to Handle Parallel and Recent Sessions #7861"
- 2025-11-22T18:31:14Z @tobiu added the `enhancement` label
- 2025-11-22T18:31:14Z @tobiu added the `ai` label
### @tobiu - 2025-11-22T18:32:03Z

**Input from Gemini:**

> ✦ The solution implemented differs from the original proposal to better balance performance and data integrity, specifically addressing the "Parallel Session" and "Crash Recovery" use cases.
> 
> **Implemented Logic: "Eventual Consistency with 30-Day Scope"**
> 
> Instead of complex timestamp comparisons or a strict 48-hour window, we implemented a robust "Drift Detection" strategy:
> 
> 1.  **Scoped Fetch:** We fetch all memories and summaries active in the last **30 days** (using ChromaDB `$gt` filtering). This caps the dataset size while covering 99% of active work.
> 2.  **Drift Detection:** We simply compare the **Database Memory Count** vs. **Summary Metadata Count** for each session.
>     -   `DB Count !== Summary Count` -> **Re-Summarize**.
>     -   This handles **additions** (active parallel sessions adding memories) and **deletions** (corrections).
> 3.  **Self-Healing:** The system self-corrects on the next startup. If a session crashes or runs in parallel, the next agent session will detect the count mismatch and update the summary, ensuring no context is lost.
> 
> **Why this is better:**
> -   **Simplicity:** Removes brittle "time-since-last-update" logic.
> -   **Robustness:** Guarantees that any session modified within the last month is accurately summarized.
> -   **Safety:** Using pagination and database-side filtering ensures the service scales safely even with a large total history.
> 
> **Trade-off Accepted:**
> We accept a small token overhead for currently active parallel sessions (they may be re-summarized on each new session startup), but this guarantees that context is always up-to-date for all agents.

- 2025-11-22T18:32:33Z @tobiu closed this issue

