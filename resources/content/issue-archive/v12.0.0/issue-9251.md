---
id: 9251
title: Enhance Location Normalizer and Document Macro-Economic Insights
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T13:34:22Z'
updatedAt: '2026-02-22T13:40:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9251'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-22T13:40:48Z'
---
# Enhance Location Normalizer and Document Macro-Economic Insights

The DevIndex data reveals striking disparities in open-source contributions across different countries (e.g., Germany vs. India/China). This data tells a powerful macro-economic policy story regarding FOSS funding and ecosystem fragmentation.

Tasks:
- Enhance `LocationNormalizer.mjs`: Expand the `cityMap` to include major tech hubs in India (Hyderabad, Pune, Chennai, etc.), China (Hangzhou, Chengdu, Guangzhou, etc.), and other global centers. Fix the "Stanford, CA" collision bug where it falsely maps to Canada (CA).
- Re-parse the existing `users.jsonl` database with the updated normalizer to ensure the most accurate country counts.
- Update `learn/guides/devindex/Introduction.md` to highlight the specific macro-economic disparities (using Germany, US, UK, China, and India as examples). Emphasize how this exposes the lack of government support in some regions versus ecosystem fragmentation in others.
- Update `learn/guides/devindex/data-factory/DataEnrichment.md` to explicitly mention that the `LocationNormalizer` requires continuous curation to avoid Western-centric bias.

## Timeline

- 2026-02-22T13:34:23Z @tobiu added the `documentation` label
- 2026-02-22T13:34:23Z @tobiu added the `enhancement` label
- 2026-02-22T13:34:23Z @tobiu added the `ai` label
- 2026-02-22T13:34:32Z @tobiu assigned to @tobiu
- 2026-02-22T13:40:21Z @tobiu referenced in commit `a850068` - "feat: Enhance LocationNormalizer and update macro-economic docs (#9251)"
### @tobiu - 2026-02-22T13:40:35Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the tasks outlined in this issue:
> - Significantly expanded the `LocationNormalizer.mjs` `cityMap` to include major tech hubs across China, India, and global centers, resolving the "Stanford, CA" collision bug by explicitly mapping it to the US.
> - Wrote and executed a script to re-parse the 50,000 active users in `users.jsonl` through the updated normalizer, resulting in updated country representations (e.g., DE: 2,659, IN: 1,042, CN: 2,850).
> - Rewrote the "Data Science Use Cases" section in `learn/guides/devindex/Introduction.md` to highlight the macro-economic reality check. The section now details the per-capita overperformance of Germany and the UK versus the structural gaps in India and ecosystem fragmentation in China.
> - Added a "Curatorial Caveat" note to `learn/guides/devindex/data-factory/DataEnrichment.md` emphasizing the need to continually expand the city map to avoid Western-centric bias.
> 
> Changes committed and pushed to the `dev` branch. Closing the issue.

- 2026-02-22T13:40:48Z @tobiu closed this issue

