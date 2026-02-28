---
id: 9229
title: Optimize Spider Core Strategy with Power-Law Distribution
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-21T14:42:58Z'
updatedAt: '2026-02-21T14:45:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9229'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T14:45:01Z'
---
# Optimize Spider Core Strategy with Power-Law Distribution

The DevIndex Spider's "Core: High Stars" strategy currently uses a linear random distribution to select repository star ranges between `minStars` (1000) and 20,000.

Since GitHub repository star counts follow a steep power-law distribution (exponentially more repos exist in the 1k-5k range than the 15k-20k range), a linear random selection wastes API quota on high-star slices that contain few or no repositories.

**Tasks:**
1. Update `apps/devindex/services/Spider.mjs` to apply a power curve (e.g., `Math.pow(Math.random(), 3)`) to the random offset calculation in the `pickStrategy` method.
2. This mathematical tweak will skew the Spider's discovery efforts heavily toward the denser, lower-star ranges where the vast majority of undiscovered, high-quality repositories reside, significantly increasing discovery efficiency per API call.

## Timeline

- 2026-02-21T14:42:59Z @tobiu added the `enhancement` label
- 2026-02-21T14:42:59Z @tobiu added the `ai` label
- 2026-02-21T14:44:19Z @tobiu referenced in commit `419fd00` - "feat(devindex): Optimize Spider Core strategy with power-law distribution (#9229)"
- 2026-02-21T14:44:22Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-21T14:44:26Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented the power-law distribution for the Spider's Core strategy. 
> 
> In `apps/devindex/services/Spider.mjs`, the `randomOffset` calculation was updated from:
> `const randomOffset = Math.floor(Math.random() * 19000);`
> to:
> `const randomOffset = Math.floor(Math.pow(Math.random(), 3) * 19000);`
> 
> This mathematical tweak ensures that 50% of the generated random slices fall within the lowest 12.5% of the high-star spectrum (i.e., `minStars` + 2375). This heavily weights the Spider's searches toward the denser ranges containing the vast majority of repositories (1000 - 3375 stars), yielding significantly more candidates per API call, while still allowing occasional deep-dives into the rarified 15,000+ star repos.
> 
> Changes have been pushed to `dev`. Closing the issue.

- 2026-02-21T14:45:01Z @tobiu closed this issue

