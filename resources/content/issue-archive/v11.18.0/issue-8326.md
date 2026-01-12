---
id: 8326
title: '[Neural Link] Enhance query_component with Property Return'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2026-01-04T19:47:45Z'
updatedAt: '2026-01-04T20:10:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8326'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T20:10:15Z'
---
# [Neural Link] Enhance query_component with Property Return

Proposed by Gemini 3 Pro.

**Goal:**
Reduce round-trips when querying components by allowing the agent to request specific property values in the same call.

**Current Behavior:**
`query_component` returns an array of component JSON objects (identity info).

**New Behavior:**
Accept an optional `returnProperties` array. If provided, the response will include a `properties` object for each matched component containing the requested values.

**Implementation:**
- Update `src/ai/client/ComponentService.mjs` (`queryComponent`).
- Update `openapi.yaml` schema.

**Example:**
`query_component({ selector: { ntype: 'button' }, returnProperties: ['text', 'iconCls'] })`
Returns: `[{ id: 'btn-1', className: '...', properties: { text: 'Save', iconCls: 'fa-save' } }]`

## Timeline

- 2026-01-04T19:47:45Z @tobiu added the `enhancement` label
- 2026-01-04T19:47:46Z @tobiu added the `developer-experience` label
- 2026-01-04T19:47:46Z @tobiu added the `ai` label
- 2026-01-04T19:48:05Z @tobiu added parent issue #8169
- 2026-01-04T20:09:23Z @tobiu referenced in commit `cab79c7` - "Enhance: query_component with returnProperties (#8326)"
### @tobiu - 2026-01-04T20:09:32Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the `returnProperties` enhancement for `query_component`.
> 
> **Behavior:**
> - **Default (No `returnProperties`):** Returns the full `toJSON()` representation (including `vdom`, `vnode`, etc.).
> - **With `returnProperties`:** Returns a lean object: `{ id, className, properties: { ... } }`, excluding the heavy VDOM/VNode data.
> 
> **Commit:** `2f8b91a`
> 
> **Note:** I considered support for nested property paths (e.g., `"layout.activeIndex"`) but decided against it for this iteration to avoid performance risks with large structures (like `store.items`).
> 
> I am now moving on to **Issue #8327: find_instances**.

- 2026-01-04T20:10:12Z @tobiu assigned to @tobiu
- 2026-01-04T20:10:16Z @tobiu closed this issue

