---
id: 7389
title: Investigate Worker Console Access with MCP
state: CLOSED
labels:
  - enhancement
  - stale
  - ai
assignees:
  - tobiu
createdAt: '2025-10-06T10:36:47Z'
updatedAt: '2026-01-09T00:57:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7389'
author: tobiu
commentsCount: 4
parentIssue: 7385
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T00:57:55Z'
---
# Investigate Worker Console Access with MCP

This ticket is for investigating the feasibility of accessing worker and shared worker consoles using the Chrome DevTools Model Context Protocol (MCP) server. This is a crucial step in enabling full-stack debugging in our multi-threaded application.

## Acceptance Criteria

1.  A research document is created that summarizes the findings.
2.  The document answers the following questions:
    a.  Can we access the console logs of app workers?
    b.  Can we access the console logs of shared workers?
    c.  What are the limitations, if any?
3.  The document provides code examples or links to relevant documentation to support the findings.

## Timeline

- 2025-10-06T10:36:48Z @tobiu added the `enhancement` label
- 2025-10-06T10:36:48Z @tobiu added the `help wanted` label
- 2025-10-06T10:36:48Z @tobiu added the `good first issue` label
- 2025-10-06T10:36:48Z @tobiu added the `hacktoberfest` label
- 2025-10-06T10:36:48Z @tobiu added parent issue #7385
- 2025-10-06T10:36:49Z @tobiu added the `ai` label
- 2025-10-06T15:37:35Z @tobiu assigned to @tobiu
- 2025-10-06T15:37:39Z @tobiu removed the `help wanted` label
- 2025-10-06T15:37:40Z @tobiu removed the `good first issue` label
- 2025-10-06T15:37:40Z @tobiu removed the `hacktoberfest` label
### @tobiu - 2025-10-06T15:38:30Z

I tested this one, and sadly neither access to dedicated nor shared workers is possible yet. Remote method access comes to the rescue.

<img width="1304" height="1360" alt="Image" src="https://github.com/user-attachments/assets/6d41f8f6-1fc9-444d-b283-0e0da88aebf8" />

### @tobiu - 2025-10-08T14:00:56Z

I added 2 new feature requests for dedicated & shared workers support inside the `mcp-server` repo. Adding the links here for cross reference, and enable others to see the status.

Dedicated Workers:
https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/316

Shared Workers:
https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/317

### @github-actions - 2026-01-07T03:10:01Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-01-07T03:10:01Z @github-actions added the `stale` label
### @tobiu - 2026-01-09T00:57:23Z

**Input from Gemini 3 Pro:**

> ✦ **Status Update: Obsolete**
> 
> This investigation is no longer relevant. The **Neural Link** (v11.18.0+) provides native access to the Neo.mjs runtime environment, including state and component hierarchies across workers, rendering raw console access via DevTools unnecessary for agentic workflows.
> 
> **Action:** Closing as superseded by the Neural Link architecture.

- 2026-01-09T00:57:55Z @tobiu closed this issue

