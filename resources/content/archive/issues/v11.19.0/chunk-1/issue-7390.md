---
id: 7390
title: Create a "Sighted" Development Demo
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - stale
  - hacktoberfest
assignees: []
createdAt: '2025-10-06T10:38:41Z'
updatedAt: '2026-01-09T00:58:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7390'
author: tobiu
commentsCount: 4
parentIssue: 7385
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T00:58:07Z'
---
# Create a "Sighted" Development Demo

This ticket is for creating a proof-of-concept demo of the new "Sighted" Development Workflow. The demo will showcase the agent's ability to develop a component while interactively verifying it and generating tests.

## Acceptance Criteria

1.  A simple new component is created using the "Sighted" Development Workflow.
2.  A screen recording or a detailed blog post is created that demonstrates the entire process, including:
    a.  The agent writing the code for the component.
    b.  The agent using the MCP server to inspect the DOM and verify the component's rendering.
    c.  The agent generating a Playwright test for the component.
3.  The demo serves as a learning resource and a showcase of the new capabilities.

## Timeline

- 2025-10-06T10:38:42Z @tobiu added the `enhancement` label
- 2025-10-06T10:38:42Z @tobiu added parent issue #7385
- 2025-10-06T10:38:43Z @tobiu added the `help wanted` label
- 2025-10-06T10:38:43Z @tobiu added the `good first issue` label
- 2025-10-06T10:38:43Z @tobiu added the `hacktoberfest` label
### @yashgoyal0110 - 2025-10-06T10:44:10Z

Hey @tobiu 
Assign please!

### @tobiu - 2025-10-06T11:05:39Z

Hi, and thanks for your interest. This is a pretty exciting R&D topic.

Let me give you some input:
https://developer.chrome.com/blog/chrome-devtools-mcp (just released => September 23)

The goal is to integrate this into the existing AI native workflow(s).

You need to read these ones:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

Hint: the devtools MCP server requires Node 22.12.0 LTS or a newer LTS

I also strongly recommend to join the Slack and / or Discord Channels:
https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA
https://discord.gg/6p8paPq

Let me know in case you are still up for the task! If so, I will assign the ticket to you.

### @github-actions - 2026-01-05T03:23:18Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-01-05T03:23:19Z @github-actions added the `stale` label
### @tobiu - 2026-01-09T00:57:25Z

**Input from Gemini 3 Pro:**

> ✦ **Status Update: Obsolete**
> 
> The concept of a "Sighted" demo using Chrome DevTools is now deprecated. We are moving towards **"Neural Link"** demos, where agents interact with the application engine directly rather than the browser DOM.
> 
> **Action:** Closing as superseded.

- 2026-01-09T00:58:07Z @tobiu closed this issue

