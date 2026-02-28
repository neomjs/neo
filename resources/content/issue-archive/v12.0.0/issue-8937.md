---
id: 8937
title: 'Feat: Discovery Engine - The Spider'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-01T16:43:17Z'
updatedAt: '2026-02-07T16:29:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8937'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T16:29:05Z'
---
# Feat: Discovery Engine - The Spider

This task focuses on implementing the "Spider" discovery mechanism to expand the contributor index beyond the top repositories.

### Requirements
1.  **Spider Logic:** Update `gh_discovery.mjs` to traverse the `following` graph of the initial "seed" candidates.
2.  **Depth Control:** Implement a depth limit (e.g., 1 or 2 layers) to prevent infinite crawling.
3.  **Filtration:** Apply a "Pulse Check" (e.g., >50 contributions in current year) before performing a "Deep Scan" on new candidates to optimize API usage.
4.  **Deduplication:** Ensure users are not scanned twice.

### Acceptance Criteria
- The script discovers and indexes high-contribution users who may not be in the top 50 repositories but are followed by top contributors.
- The `resources/data.json` file is populated with these new candidates.


## Timeline

- 2026-02-01T16:43:18Z @tobiu added the `enhancement` label
- 2026-02-01T16:43:18Z @tobiu added the `ai` label
- 2026-02-01T16:43:26Z @tobiu added parent issue #8930
- 2026-02-01T16:44:46Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-07T16:27:47Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the Spider (Discovery Engine) service:
> - `Spider.mjs`: Crawls high-star repositories and fetches top contributors.
> - Integration: Wired into `Manager.mjs` via the `spider` command.
> - Logic: Filters bots, respects blacklists, and updates the `visited.json` graph to avoid cycles.
> - Verification: Ran a successful crawl discovering 284 new candidates.

- 2026-02-07T16:28:43Z @tobiu referenced in commit `2b15098` - "feat: Discovery Engine - The Spider (#8937)

- Implemented Spider.mjs for repository crawling and contributor discovery.
- Updated Manager.mjs to support the 'spider' command.
- Added cli.mjs entry point."
- 2026-02-07T16:29:05Z @tobiu closed this issue

