---
id: 7389
title: Investigate Worker Console Access with MCP
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-06T10:36:47Z'
updatedAt: '2025-10-08T14:00:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7389'
author: tobiu
commentsCount: 2
parentIssue: 7385
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Investigate Worker Console Access with MCP

**Reported by:** @tobiu on 2025-10-06

---

**Parent Issue:** #7385 - 'Sighted' Agent - Chrome DevTools Integration

---

This ticket is for investigating the feasibility of accessing worker and shared worker consoles using the Chrome DevTools Model Context Protocol (MCP) server. This is a crucial step in enabling full-stack debugging in our multi-threaded application.

## Acceptance Criteria

1.  A research document is created that summarizes the findings.
2.  The document answers the following questions:
    a.  Can we access the console logs of app workers?
    b.  Can we access the console logs of shared workers?
    c.  What are the limitations, if any?
3.  The document provides code examples or links to relevant documentation to support the findings.

## Comments

### @tobiu - 2025-10-06 15:38

I tested this one, and sadly neither access to dedicated nor shared workers is possible yet. Remote method access comes to the rescue.

<img width="1304" height="1360" alt="Image" src="https://github.com/user-attachments/assets/6d41f8f6-1fc9-444d-b283-0e0da88aebf8" />

### @tobiu - 2025-10-08 14:00

I added 2 new feature requests for dedicated & shared workers support inside the `mcp-server` repo. Adding the links here for cross reference, and enable others to see the status.

Dedicated Workers:
https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/316

Shared Workers:
https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/317

