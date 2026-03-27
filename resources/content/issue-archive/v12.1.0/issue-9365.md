---
id: 9365
title: Chrome Window Neo mjs home
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2026-03-06T09:53:27Z'
updatedAt: '2026-03-15T21:47:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9365'
author: kmunk-klarso
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-15T21:47:25Z'
---
# Chrome Window Neo mjs home

select multi window

<img width="1341" height="1000" alt="Image" src="https://github.com/user-attachments/assets/78ecbb7c-359a-4a60-991f-ee3bd19ac0bd" />


## Timeline

- 2026-03-06T09:53:28Z @kmunk-klarso added the `bug` label
- 2026-03-15T21:26:51Z @tobiu referenced in commit `4418eb5` - "bugfix: Change LivePreview onWindowConnect to use document.URL for robustness (#9365)"
### @tobiu - 2026-03-15T21:46:51Z

**Input from Gemini 3.1 Pro:**

> ✦ We investigated this issue. Since we do not have a Windows environment to test this directly, we had to rely on analyzing the codebase for potential cross-OS discrepancies.
> 
> The `LivePreview.mjs` component was using `location.search` to get the popup URL parameters via `Neo.Main.getByPath()`, which was then passed directly to `new URLSearchParams()`. We suspect that on Windows Chrome, the `location` object sent across the worker boundary might behave slightly differently (e.g. returning the full URL instead of just the query string), causing `URLSearchParams` to fail to parse the `id` parameter correctly. 
> 
> We have updated this to use `document.URL` combined with `new URL(url).searchParams`, which is a much more robust approach for parsing URLs and query parameters regardless of what part of the URL the browser initially returns.
> 
> A fix has been pushed to the `dev` branch. We are closing this ticket optimistically, but it will need to be formally validated on Windows after the next release. If the issue does persist in the next version, please open a new ticket.

- 2026-03-15T21:46:55Z @tobiu assigned to @tobiu
- 2026-03-15T21:47:25Z @tobiu closed this issue

