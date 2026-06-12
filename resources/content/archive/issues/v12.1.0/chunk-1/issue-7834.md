---
id: 7834
title: '[Test] Button click event not firing on mobile'
state: CLOSED
labels:
  - bug
  - stale
  - testing
assignees: []
createdAt: '2025-11-21T01:02:19Z'
updatedAt: '2026-03-08T03:39:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7834'
author: tobiu
commentsCount: 10
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T03:39:52Z'
---
# [Test] Button click event not firing on mobile

**Description**
This is a test issue created to validate the "Self-Healing" AI agent workflow.

**Symptoms**
When a button is clicked in a mobile viewport, the `handler` config is ignored.

**Suspected Cause**
Potential conflict between `click` and `touchend` events in `src/manager/DomEvent.mjs`.


## Timeline

- 2025-11-21T01:02:21Z @tobiu added the `bug` label
- 2025-11-21T01:02:21Z @tobiu added the `testing` label
### @tobiu - 2025-11-21T01:03:30Z

**Input from Neo Agent OS:**

> ◆ 
> ### 🤖 Agent OS Analysis
> 
> I have analyzed this issue using the local Knowledge Base.
> 
> **Context Identified:**
> - /Users/Shared/github/neomjs/neo/learn/guides/userinteraction/events/DomEvents.md
> - /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/WorkingWithVDom.md
> - /Users/Shared/github/neomjs/neo/learn/tutorials/CreatingAFunctionalButton.md
> 
> **Proposed Investigation:**
> Based on the symptoms and the retrieved context, I recommend inspecting the event delegation logic in 
> DomEvent.mjs
> . The search results indicate potential overlaps between touch and click handling in the mobile viewports.
> 
> *This comment was generated autonomously by the Neo.mjs Agent OS.*
>     

- 2025-11-21T01:16:16Z @tobiu cross-referenced by #7833
### @tobiu - 2025-11-21T01:37:53Z

**Input from Neo Agent OS:**

> ◆ 
> ### 🤖 Agent OS Analysis
> 
> I have analyzed this issue using the local Knowledge Base.
> 
> **Context Identified:**
> - /Users/Shared/github/neomjs/neo/learn/guides/userinteraction/events/DomEvents.md
> - /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/WorkingWithVDom.md
> - /Users/Shared/github/neomjs/neo/learn/tutorials/CreatingAFunctionalButton.md
> 
> **Proposed Investigation:**
> Based on the symptoms and the retrieved context, I recommend inspecting the event delegation logic in 
> DomEvent.mjs
> . The search results indicate potential overlaps between touch and click handling in the mobile viewports.
> 
> *This comment was generated autonomously by the Neo.mjs Agent OS.*
>     

### @tobiu - 2025-11-21T01:59:40Z

**Input from Neo Agent OS:**

> ◆ 
> ### 🤖 Agent OS Analysis
> 
> I have analyzed this issue using the local Knowledge Base.
> 
> **Context Identified:**
> - /Users/Shared/github/neomjs/neo/learn/guides/userinteraction/events/DomEvents.md
> - /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/WorkingWithVDom.md
> - /Users/Shared/github/neomjs/neo/learn/tutorials/CreatingAFunctionalButton.md
> 
> **Proposed Investigation:**
> Based on the symptoms and the retrieved context, I recommend inspecting the event delegation logic in 
> DomEvent.mjs
> . The search results indicate potential overlaps between touch and click handling in the mobile viewports.
> 
> *This comment was generated autonomously by the Neo.mjs Agent OS.*
>     

### @tobiu - 2025-11-21T09:01:57Z

**Input from Neo Agent OS:**

> ◆ 
> ### 🤖 Agent OS Analysis
> 
> I have analyzed this issue using the local Knowledge Base.
> 
> **Context Identified:**
> - /Users/Shared/github/neomjs/neo/learn/guides/userinteraction/events/DomEvents.md
> - /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/WorkingWithVDom.md
> - /Users/Shared/github/neomjs/neo/learn/tutorials/CreatingAFunctionalButton.md
> 
> **Proposed Investigation:**
> Based on the symptoms and the retrieved context, I recommend inspecting the event delegation logic in 
> DomEvent.mjs
> . The search results indicate potential overlaps between touch and click handling in the mobile viewports.
> 
> *This comment was generated autonomously by the Neo.mjs Agent OS.*
>     

### @tobiu - 2025-11-21T09:14:59Z

**Input from Neo Agent OS:**

> ◆ 
> ### 🤖 Agent OS Analysis
> 
> I have analyzed this issue using the local Knowledge Base.
> 
> **Context Identified:**
> - /Users/Shared/github/neomjs/neo/learn/guides/userinteraction/events/DomEvents.md
> - /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/WorkingWithVDom.md
> - /Users/Shared/github/neomjs/neo/learn/tutorials/CreatingAFunctionalButton.md
> 
> **Proposed Investigation:**
> Based on the symptoms and the retrieved context, I recommend inspecting the event delegation logic in 
> DomEvent.mjs
> . The search results indicate potential overlaps between touch and click handling in the mobile viewports.
> 
> *This comment was generated autonomously by the Neo.mjs Agent OS.*
>     

### @tobiu - 2025-11-21T09:23:04Z

**Input from Neo Agent OS:**

> ◆ 
> ### 🤖 Agent OS Analysis
> 
> I have analyzed this issue using the local Knowledge Base.
> 
> **Context Identified:**
> - /Users/Shared/github/neomjs/neo/learn/guides/userinteraction/events/DomEvents.md
> - /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/WorkingWithVDom.md
> - /Users/Shared/github/neomjs/neo/learn/tutorials/CreatingAFunctionalButton.md
> 
> **Proposed Investigation:**
> Based on the symptoms and the retrieved context, I recommend inspecting the event delegation logic in 
> DomEvent.mjs
> . The search results indicate potential overlaps between touch and click handling in the mobile viewports.
> 
> *This comment was generated autonomously by the Neo.mjs Agent OS.*
>     

### @tobiu - 2025-11-21T10:03:49Z

**Input from Neo Agent OS:**

> ◆ 
> ### 🤖 Agent OS Analysis
> 
> I have analyzed this issue using the local Knowledge Base.
> 
> **Context Identified:**
> - /Users/Shared/github/neomjs/neo/learn/guides/userinteraction/events/DomEvents.md
> - /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/WorkingWithVDom.md
> - /Users/Shared/github/neomjs/neo/learn/tutorials/CreatingAFunctionalButton.md
> 
> **Proposed Investigation:**
> Based on the symptoms and the retrieved context, I recommend inspecting the event delegation logic in 
> DomEvent.mjs
> . The search results indicate potential overlaps between touch and click handling in the mobile viewports.
> 
> *This comment was generated autonomously by the Neo.mjs Agent OS.*
>     

### @tobiu - 2025-11-22T16:53:22Z

**Input from Neo Agent OS:**

> ◆ 
> ### 🤖 Agent OS Analysis
> 
> I have analyzed this issue using the local Knowledge Base.
> 
> **Context Identified:**
> - /Users/Shared/github/neomjs/neo/learn/guides/userinteraction/events/DomEvents.md
> - /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/WorkingWithVDom.md
> - /Users/Shared/github/neomjs/neo/learn/tutorials/CreatingAFunctionalButton.md
> 
> **Proposed Investigation:**
> Based on the symptoms and the retrieved context, I recommend inspecting the event delegation logic in 
> DomEvent.mjs
> . The search results indicate potential overlaps between touch and click handling in the mobile viewports.
> 
> *This comment was generated autonomously by the Neo.mjs Agent OS.*
>     

### @github-actions - 2026-02-21T03:33:58Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-02-21T03:33:59Z @github-actions added the `stale` label
### @github-actions - 2026-03-08T03:39:52Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2026-03-08T03:39:52Z @github-actions closed this issue

