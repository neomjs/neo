---
id: 9326
title: Address "Bots and Cheaters" Criticism in DevIndex Docs
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-27T10:04:42Z'
updatedAt: '2026-02-27T10:10:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9326'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-27T10:10:21Z'
---
# Address "Bots and Cheaters" Criticism in DevIndex Docs

The DevIndex top 20 contains obvious outliers (e.g., accounts with 6 million commits). This naturally leads to criticism that the index is full of "cheaters and bots."

We need to update the documentation to clearly articulate our philosophy: we do not censor the raw data (unless the profile explicitly self-identifies as a bot). These outliers are valuable datasets for researchers studying automation trends. 

We will update `Methodology.md` and `FAQ.md` to:
1. Explain this philosophy.
2. Point users to the `Hide Commit Ratio > 90%` filter for a more "human" view.
3. Invite the community to submit PRs for better algorithmic filters or data annotations instead of just complaining.

## Timeline

- 2026-02-27T10:04:44Z @tobiu added the `documentation` label
- 2026-02-27T10:04:44Z @tobiu added the `enhancement` label
- 2026-02-27T10:04:44Z @tobiu added the `ai` label
- 2026-02-27T10:09:57Z @tobiu referenced in commit `05938d4` - "docs(devindex): Address 'bots and cheaters' criticism (#9326)

- Updated Methodology.md to explicitly explain the philosophy of raw data and the refusal to censor outliers without explicit self-identification as bots.
- Replaced the problematic term 'script kiddie' with 'automation spam' in Methodology.md.
- Referenced the Data Scientists persona guide to explain the value of these outliers for automation trend research.
- Added a new FAQ entry directly answering why there are 'bots and cheaters' at the top of the list.
- Highlighted the 'Hide Commit Ratio > 90%' filter.
- Added a community call to action, inviting data scientists and developers to submit PRs for better heuristics instead of just complaining."
- 2026-02-27T10:10:06Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-27T10:10:09Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully applied the refined changes to `Methodology.md` and `FAQ.md`. 
> The problematic 'script kiddie' phrase was replaced with 'automation spam', the redundant Data Factory wording was fixed, and the new philosophy section now correctly references the Data Scientists guide.
> 
> The changes have been committed and pushed to `dev`.

- 2026-02-27T10:10:21Z @tobiu closed this issue
- 2026-02-27T10:44:39Z @tobiu cross-referenced by #9325

