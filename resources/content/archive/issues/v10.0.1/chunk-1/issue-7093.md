---
id: 7093
title: Create v10 Top-Level Blog Post
state: CLOSED
labels:
  - epic
  - Blog Post
assignees:
  - tobiu
createdAt: '2025-07-22T06:25:01Z'
updatedAt: '2025-07-24T07:11:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7093'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 7094 Create Deep-Dive Blog Post for State Providers'
  - '[x] 7095 Create Deep-Dive Blog Post for the Reactive Core'
  - '[x] 7096 Create Deep-Dive Blog Post for Performance & Security'
  - '[x] 7097 Create Deep-Dive Blog Post for Functional Components'
subIssuesCompleted: 4
subIssuesTotal: 4
blockedBy: []
blocking: []
closedAt: '2025-07-24T07:11:35Z'
---
# Create v10 Top-Level Blog Post

## 1. Goal
Create the main "hub" blog post for the v10 release. This post should be a high-level, compelling summary of the new features and their benefits.

## 2. Target Audience
All web developers, including those from other framework ecosystems (React, Vue, etc.). The tone should be exciting and accessible, using analogies to explain complex topics.

## 3. Content Plan & Narrative

**Title:** Neo.mjs v10: The Reactive, Multi-Threaded Framework You've Been Waiting For

**Opening Hook:** Start by addressing a universal pain point: "Is your main thread holding your application hostage? What if you could build complex, data-heavy UIs that run silky-smooth by default, because the framework was designed from the ground up to move the hard work off the main thread?" This immediately introduces the core differentiator of Neo.mjs.

---

### Section 1: A Modern, Functional UI Layer You'll Love
*   **Focus:** Introduce `defineComponent` and `useConfig`. This is the most relatable entry point for developers coming from React/Vue.
*   **Narrative:** "We've built a modern, hook-based functional UI layer that will feel right at home. But this is just the beginning. This familiar API is supercharged by Neo.mjs's unique architecture."
*   **Visuals:** A simple code snippet showing a functional component.

---

### Section 2: Effortless State Management with "Two-Tier Reactivity"
*   **Focus:** Explain the power and flexibility of the new reactivity model.
*   **Narrative:** "Neo.mjs offers a revolutionary 'Two-Tier' reactivity system. Need the automatic, 'spreadsheet-style' magic of declarative effects? You've got it. Need the fine-grained control of imperative hooks? It's there too. They work together seamlessly, giving you the right tool for every job."
*   **Analogy:** Use the "Subscription Service" vs. "Manual Phone Tree" analogy from the brainstorm document.

---

### Section 3: The Performance Powerhouse: Asymmetric VDOM Updates
*   **Focus:** This is where we introduce the star of the performance story.
*   **Narrative:** "We've moved beyond the traditional Virtual DOM. Our new VDOM engine performs **asymmetric updates**. When a parent and a deeply nested child change at the same time, we don't re-render the whole tree. We create a single, surgical payload with the changes, telling the renderer to ignore everything else. The result is hyper-efficient updates and unparalleled performance."
*   **Analogy:** "Instead of sending a blueprint for the whole building, we send a blueprint for just the one room that changed."

---

### Section 4: Secure by Design
*   **Focus:** A quick, impactful point on security.
*   **Narrative:** "In today's web, security can't be an afterthought. Neo.mjs helps you build safer apps by default, automatically protecting you from common XSS vulnerabilities by design."

---

### Section 5: The Bigger Picture
*   **Focus:** Briefly mention the other key pillars that enable this.
*   **Narrative:** "All of this is made possible by a suite of architectural innovations, including an intelligent state provider model that makes managing complex data hierarchies feel intuitive. We'll explore all these topics in our deep-dive series."

---

### Call to Action
*   **Focus:** Guide the reader to the next steps.
*   **Narrative:** "Ready to experience the future of web development? Explore our new functional component examples, and when you're ready to see how it all works, dive into our technical articles."
*   **Links:**
    *   Link to the functional component examples.
    *   Link to the "hub" page for the deep-dive blog posts.

## 4. Deliverable
A complete draft of the blog post as a markdown file, following this new structure.

## Timeline

- 2025-07-22T06:25:01Z @tobiu assigned to @tobiu
- 2025-07-22T06:25:02Z @tobiu added the `enhancement` label
- 2025-07-22T06:25:03Z @tobiu added the `epic` label
- 2025-07-22T06:26:01Z @tobiu added sub-issue #7094
- 2025-07-22T06:26:08Z @tobiu removed the `enhancement` label
- 2025-07-22T06:26:08Z @tobiu added the `Blog Post` label
- 2025-07-22T06:26:50Z @tobiu added sub-issue #7095
- 2025-07-22T06:27:33Z @tobiu added sub-issue #7096
- 2025-07-22T06:28:11Z @tobiu added sub-issue #7097
- 2025-07-22T06:33:10Z @tobiu referenced in commit `59f3006` - "Create v10 Top-Level Blog Post #7093 initial ticket versions"
- 2025-07-22T06:48:54Z @tobiu referenced in commit `886b8c7` - "#7093 super early draft"
- 2025-07-22T07:02:10Z @tobiu referenced in commit `b111e4a` - "#7093 more "why" focussed draft"
- 2025-07-22T07:04:59Z @tobiu referenced in commit `28b1040` - "#7093 more "provocative" draft"
- 2025-07-22T07:10:43Z @tobiu referenced in commit `28e491f` - "#7093 thoughts on vdom"
- 2025-07-22T07:15:10Z @tobiu referenced in commit `4aa0152` - "#7093 WIP"
- 2025-07-22T07:23:11Z @tobiu referenced in commit `a3a878b` - "#7093 WIP"
- 2025-07-22T07:37:38Z @tobiu referenced in commit `b9f93b4` - "#7093 WIP"
- 2025-07-22T07:49:36Z @tobiu referenced in commit `26ddc83` - "#7093 WIP"
- 2025-07-22T07:59:02Z @tobiu referenced in commit `eae5048` - "#7093 WIP"
- 2025-07-22T08:53:51Z @tobiu referenced in commit `89f9fd2` - "#7093 WIP"
- 2025-07-22T09:51:49Z @tobiu referenced in commit `e88a5dd` - "#7093 alternative strategy"
- 2025-07-22T10:03:09Z @tobiu referenced in commit `bd6b650` - "#7093 alternative strategy"
- 2025-07-22T10:24:14Z @tobiu referenced in commit `b56391b` - "#7093 wip"
- 2025-07-22T10:28:48Z @tobiu referenced in commit `6d7286d` - "#7093 wip"
- 2025-07-22T20:24:13Z @tobiu referenced in commit `f6a1e7f` - "#7093 combined updates"
- 2025-07-23T11:25:59Z @tobiu referenced in commit `0031baf` - "#7093 more advanced example for fn cmps, moved main thread addons & initAsync() into the reactivity blog post"
- 2025-07-23T12:55:08Z @tobiu referenced in commit `281ac9b` - "#7093 article navigation"
- 2025-07-23T13:09:54Z @tobiu referenced in commit `5b5f115` - "#7093 top-level code example WIP"
- 2025-07-23T13:42:08Z @tobiu referenced in commit `caa6da0` - "#7093 formatting"
- 2025-07-23T14:11:17Z @tobiu referenced in commit `0dd48e4` - "#7093 WIP"
- 2025-07-23T14:40:37Z @tobiu referenced in commit `9697ad7` - "#7093 WIP"
- 2025-07-23T15:24:13Z @tobiu referenced in commit `b4e43f5` - "#7093 smarter series navigation"
- 2025-07-23T20:15:32Z @tobiu referenced in commit `fad2a01` - "#7093 personal note"
- 2025-07-23T20:43:34Z @tobiu referenced in commit `cf17848` - "#7093 polishing"
- 2025-07-23T21:00:24Z @tobiu referenced in commit `4d171a0` - "#7093 adding weight to "framework for ai""
- 2025-07-23T22:49:06Z @tobiu referenced in commit `41d3c05` - "#7093 more code examples"
- 2025-07-23T23:18:03Z @tobiu referenced in commit `51a2e42` - "#7093 main thread addon in-depth example"
- 2025-07-23T23:26:56Z @tobiu referenced in commit `b535909` - "#7093 examples polishing"
- 2025-07-23T23:52:54Z @tobiu referenced in commit `32f6719` - "#7093 cleanup"
- 2025-07-24T07:11:35Z @tobiu closed this issue

