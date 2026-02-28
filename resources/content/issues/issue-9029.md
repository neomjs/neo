---
id: 9029
title: 'Feat: DevRank Relevance Threshold'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2026-02-07T18:17:13Z'
updatedAt: '2026-02-07T18:18:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9029'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T18:18:46Z'
---
# Feat: DevRank Relevance Threshold

Implement a minimum contribution threshold to ensure the quality of the DevRank index.

**Changes:**
- `Config.mjs`: Add `minTotalContributions` (default: 1000).
- `Updater.mjs`: After fetching user data, check `total_contributions`. If below threshold, discard the record (do not add to `data.json`).
- **Optimization:** This ensures `data.json` remains a high-signal list of impactful developers.

## Timeline

- 2026-02-07T18:17:14Z @tobiu added the `enhancement` label
- 2026-02-07T18:17:24Z @tobiu added parent issue #8930
- 2026-02-07T18:17:43Z @tobiu assigned to @tobiu
- 2026-02-07T18:18:21Z @tobiu referenced in commit `6aa3049` - "feat: DevRank Relevance Threshold (#9029)

- Added minTotalContributions config (default: 1000).
- Updated Updater service to discard records below threshold while maintaining scan timestamp."
- 2026-02-07T18:18:46Z @tobiu closed this issue

