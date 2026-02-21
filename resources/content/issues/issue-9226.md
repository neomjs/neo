---
id: 9226
title: 'Enhance KB: Document maxUsers cap and performance trade-offs in DevIndex'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-21T14:21:15Z'
updatedAt: '2026-02-21T14:22:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9226'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T14:22:37Z'
---
# Enhance KB: Document maxUsers cap and performance trade-offs in DevIndex

Following the implementation of the `maxUsers` cap (50k limit) for the DevIndex, we need to apply the Knowledge Base Enhancement Strategy to document this architectural decision.

**Rationale:** If we allowed the index to grow unbounded (e.g., 100k users), the `users.jsonl` file would reach ~40MB. While we stream and gzip the data, client-side memory constraints and parsing overhead would eventually degrade the application's responsiveness and UX. The cap ensures the app remains fast and "fun to use" while maintaining high quality via the dynamic contribution threshold.

**Tasks:**
1.  **Update `Storage.mjs`:** Enhance the class-level JSDoc to explain the pruning mechanism and the performance trade-off rationale behind the `users.jsonl` file size.
2.  **Update `config.mjs`:** Add detailed context to the `maxUsers` property explaining *why* the 50,000 limit exists (40MB file size, client-side performance).
3.  **Update `Updater.mjs`:** Briefly mention the dynamic threshold interaction with the `maxUsers` cap in the workflow description.

## Timeline

- 2026-02-21T14:21:17Z @tobiu added the `documentation` label
- 2026-02-21T14:21:17Z @tobiu added the `ai` label
- 2026-02-21T14:22:12Z @tobiu referenced in commit `a64625e` - "docs(devindex): Enhance KB by documenting maxUsers cap and performance trade-offs (#9226)"
- 2026-02-21T14:22:23Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-21T14:22:25Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the Knowledge Base Enhancement Strategy to document the new 50k user cap and its architectural rationale.
> 
> - **`config.mjs`:** Added a detailed explanation to the `maxUsers` property, highlighting the ~40MB file size projection for 100k users and the client-side memory/parsing trade-offs.
> - **`Storage.mjs`:** Expanded the class-level `@summary` to document the `maxUsers` cap, explaining how it protects the UI responsiveness by enforcing a capped `users.jsonl` size and raising the `threshold.json` bar.
> - **`Updater.mjs`:** Enhanced the class-level workflow documentation to clarify how the "Filter" phase utilizes the dynamic threshold managed by `Storage` once the cap is reached.
> 
> These changes are committed and pushed to `dev`. Closing the issue.

- 2026-02-21T14:22:38Z @tobiu closed this issue

