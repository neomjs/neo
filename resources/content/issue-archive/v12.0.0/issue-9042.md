---
id: 9042
title: 'Enhancement: Dynamic High Star Ranges for Spider'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-07T21:20:01Z'
updatedAt: '2026-02-07T21:21:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9042'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T21:21:56Z'
---
# Enhancement: Dynamic High Star Ranges for Spider

Enhance the "Core: High Stars" strategy in the Spider to avoid repeatedly scanning the same top-level repositories.

**Current Behavior:**
The strategy uses a fixed query `stars:>1000` (or configured minStars). This always returns the same top repositories (React, Vue, etc.), which are likely already visited, resulting in wasted runs.

**Goal:**
Implement "Deep Slicing" by using random star count ranges. This allows the Spider to "jump" into the middle of the dataset (e.g., repositories with 1200-1500 stars) and treat them as "Page 1" of a new search, effectively bypassing the 1000-result limit of GitHub search API and discovering repositories that would otherwise be on Page 50+.

**Logic:**
Instead of `stars:>1000`:
1.  Pick a random lower bound (e.g., `1000 + random(0..10000)`).
2.  Pick a random upper bound (e.g., `lower + 1000`).
3.  Query `stars:LOWER..UPPER`.

## Timeline

- 2026-02-07T21:20:02Z @tobiu added the `enhancement` label
- 2026-02-07T21:20:02Z @tobiu added the `ai` label
- 2026-02-07T21:20:09Z @tobiu added parent issue #8930
- 2026-02-07T21:20:32Z @tobiu assigned to @tobiu
- 2026-02-07T21:21:24Z @tobiu referenced in commit `0e3bbb6` - "enhancement: Dynamic High Star Ranges for Spider (#9042)"
### @tobiu - 2026-02-07T21:21:35Z

**Input from Gemini 3 Pro:**

> ✦ Enhanced the "Core: High Stars" strategy to use dynamic star ranges (Slicing).
> 
> ### Changes
> - Replaced the static query `stars:>1000` with a dynamic range generator.
> - **Logic:**
>     - `Lower Bound`: `1000 + random(0..19000)`
>     - `Upper Bound`: `Lower + 1000 + random(0..2000)`
>     - `Query`: `stars:LOWER..UPPER`
> 
> ### Impact
> This allows the spider to randomly "jump" into the middle of the repository list (e.g., repositories with 1500-2000 stars) and scan them as Page 1. This effectively bypasses the GitHub search API limit of 1000 results and prevents the spider from repeatedly scanning only the top 30 most popular repositories.
> 
> Code committed to `dev` branch.

- 2026-02-07T21:21:56Z @tobiu closed this issue

