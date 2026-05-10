---
id: 9175
title: 'DevIndex: Restore 2026 Data and Polish Activity Column'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-15T18:35:53Z'
updatedAt: '2026-02-15T18:50:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9175'
author: tobiu
commentsCount: 0
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T18:49:09Z'
---
# DevIndex: Restore 2026 Data and Polish Activity Column

The DevIndex grid heatmap correctly displayed 2026, but the Activity sparkline was missing it. Additionally, the 'Activity (15y)' header was hardcoded and inaccurate.

**Changes:**
1.  **Restore 2026:** Ensure both Heatmap and Sparkline loops include the current year ().
2.  **Dynamic Header:** Calculate the activity duration dynamically (e.g., 'Activity (17y)') based on the start year (2010) and current year.
3.  **Future-Proofing:** Replace hardcoded '2025' limits with dynamic current year logic.

## Timeline

- 2026-02-15T18:35:54Z @tobiu added the `enhancement` label
- 2026-02-15T18:35:54Z @tobiu added the `ai` label
- 2026-02-15T18:36:06Z @tobiu assigned to @tobiu
- 2026-02-15T18:36:16Z @tobiu added parent issue #9106
- 2026-02-15T18:48:49Z @tobiu referenced in commit `51080a9` - "fix(devindex): Restore current year data and polish activity column (#9175)

- Restore 2026 (current year) for Heatmap and Activity Sparkline.
- Implement dynamic Activity header text (e.g. 'Activity (17y)').
- Ensure loops dynamically use current year instead of hardcoded values."
- 2026-02-15T18:49:09Z @tobiu closed this issue
- 2026-02-15T18:50:41Z @tobiu changed title from **DevIndex: Cap Heatmap and Activity Data at Previous Full Year** to **DevIndex: Restore 2026 Data and Polish Activity Column**

