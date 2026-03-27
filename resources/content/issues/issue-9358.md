---
id: 9358
title: Google Windows Covid 19 Helix
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2026-03-06T09:19:32Z'
updatedAt: '2026-03-07T11:20:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9358'
author: kmunk-klarso
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T11:20:53Z'
---
# Google Windows Covid 19 Helix

<img width="254" height="243" alt="Image" src="https://github.com/user-attachments/assets/63d6ee76-ea89-451a-a9ec-bb82ed03fa44" />


## Timeline

- 2026-03-06T09:19:33Z @kmunk-klarso added the `bug` label
- 2026-03-07T10:44:26Z @tobiu assigned to @tobiu
- 2026-03-07T11:18:55Z @tobiu referenced in commit `a35064d` - "Fix covid examples navigation concept and attribution labels (#9358)"
### @tobiu - 2026-03-07T11:20:29Z

**Input from Gemini 3.1 Pro:**

> ✦ Hi @kmunk-klarso, thank you very much for opening this ticket!
> 
> I have fixed the issue in the `coronaHelix` and `coronaGallery` examples:
> - Changed `text` to `html` to correctly resolve the formatting tags for the "Navigation Concept" and "Attribution" labels.
> - Replaced `ntype: 'label'` with `module: BoxLabel` for consistency with the main app views (`apps/covid/view`).
> - Removed manual `style` blocks from the examples, as `BoxLabel` already provides the necessary styling.
> 
> The changes have been pushed to the repository. I will go ahead and close this ticket.

### @tobiu - 2026-03-07T11:20:53Z

Completed

- 2026-03-07T11:20:53Z @tobiu closed this issue

