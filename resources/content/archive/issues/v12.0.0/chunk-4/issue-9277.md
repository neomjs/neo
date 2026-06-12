---
id: 9277
title: Improve LocationNormalizer with missing cities and countries
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-23T23:27:37Z'
updatedAt: '2026-02-23T23:42:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9277'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-23T23:29:53Z'
---
# Improve LocationNormalizer with missing cities and countries

Based on the current user dataset for the DevIndex app, many locations are failing to match an ISO country code. Examples include Zurich, Vienna, Palestine, and numerous other cities and countries.

This ticket aims to update `apps/devindex/services/LocationNormalizer.mjs` by expanding the `cityMap` and the regex-based country mappings using the top unmatched locations extracted from `apps/devindex/resources/users.jsonl`.

## Timeline

- 2026-02-23T23:27:39Z @tobiu added the `enhancement` label
- 2026-02-23T23:27:39Z @tobiu added the `ai` label
- 2026-02-23T23:27:47Z @tobiu assigned to @tobiu
- 2026-02-23T23:29:29Z @tobiu referenced in commit `2cb05af` - "feat(devindex): Add extensive missing location mappings for LocationNormalizer (#9277)"
### @tobiu - 2026-02-23T23:29:36Z

**Input from Gemini 3.1 Pro:**

> ✦ I have updated `LocationNormalizer.mjs` with extensive additions based on the unmatched locations extracted from `users.jsonl`.
> - Added missing city mappings like Zurich, Vienna, Dubai, Moscow, and various European/Asian/American tech hubs.
> - Added regex mappings for missing countries like Palestine, UAE, Lithuania, Estonia, and many others.
> These additions should greatly reduce the number of unmatched users in the DevIndex grids.
> Changes are pushed in `2cb05af98`.

- 2026-02-23T23:29:53Z @tobiu closed this issue
- 2026-02-23T23:37:48Z @tobiu referenced in commit `c6ecf6a` - "feat(devindex): Add final missing location mappings from unmatched data analysis (#9277)"
### @tobiu - 2026-02-23T23:38:17Z

**Input from Gemini 3.1 Pro:**

> ✦ Added a final pass of missing locations based on the script's output, including Ecuador, Saudi Arabia, Morocco, Kyoto, Athens, Québec, Groningen, Rennes, Darmstadt, Gurgaon, Saint Petersburg, and Turin. (pushed in `c6ecf6a40`)

- 2026-02-23T23:42:23Z @tobiu referenced in commit `e66f62f` - "feat(devindex): Add cities with 4 or 5 matches & update users.jsonl via script (#9277)"
### @tobiu - 2026-02-23T23:42:31Z

**Input from Gemini 3.1 Pro:**

> ✦ I've also added places down to 4 matching occurrences from the script output, including Detroit, Bellevue, Marseille, Sheffield, Amman, Hobart, New Orleans, Glasgow, Puerto Rico, Montpellier, Peking, Istanbul, Chengdu, Guangdong, Ghana, Brno, Sofia, Liverpool, Hangzhou, Portland, Málaga, Waterloo, and Göteborg.
> 
> The script was subsequently used to actually write the updated country codes to `apps/devindex/resources/users.jsonl`, completing the normalization flow.
> 
> Total matched: ~33.5k
> Total unmatched: ~3.5k (down from many thousands, with mostly junk remaining like `earth`, `localhost`, etc).
> 
> Changes pushed in `e66f62f25`.

- 2026-02-23T23:45:56Z @tobiu referenced in commit `4c81f7c` - "fix(devindex): Add NH to US state codes in LocationNormalizer (#9277)"

