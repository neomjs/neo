---
id: 8848
title: Propagate Theme to Embedded Markdown Components
state: CLOSED
labels:
  - bug
  - design
assignees:
  - tobiu
createdAt: '2026-01-21T11:57:43Z'
updatedAt: '2026-01-21T12:06:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8848'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T12:06:21Z'
---
# Propagate Theme to Embedded Markdown Components

Ensure components embedded in Markdown (LivePreview, Mermaid, etc.) inherit the correct theme on initialization.

**Problem:**
When `Neo.component.Markdown` renders content, it spawns child components (like `LivePreview`) without passing the current `theme` config. This causes them to default to the system default (usually Light), even if the Markdown component is in Dark mode.

**Solution:**
Update `src/component/Markdown.mjs`'s `render` method to include `theme: me.theme` in the `baseConfigs` object passed to `Neo.create`.


## Timeline

- 2026-01-21T11:57:44Z @tobiu added the `bug` label
- 2026-01-21T11:57:44Z @tobiu added the `design` label
- 2026-01-21T11:58:20Z @tobiu added parent issue #8727
- 2026-01-21T11:58:39Z @tobiu assigned to @tobiu
- 2026-01-21T12:05:41Z @tobiu referenced in commit `a2057d5` - "fix: Propagate Theme to Embedded Markdown Components (#8848)"
### @tobiu - 2026-01-21T12:06:05Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the theme propagation issue for embedded Markdown components.
> 
> **Changes:**
> 1.  **Updated `src/component/Markdown.mjs`:** Modified the `render` method to include `theme: me.theme` in the `baseConfigs` object.
> 
> **Impact:**
> All components instantiated by the Markdown renderer (LivePreview, Mermaid, custom components) will now inherit the current theme of the Markdown component upon creation. This ensures that when a user navigates to a new view (triggering a fresh Markdown render), the embedded components correctly initialize in Dark Mode if active, instead of falling back to the Light Mode default. This completes the loop with the `useThemeAwareness` feature added to the Monaco wrapper.

- 2026-01-21T12:06:21Z @tobiu closed this issue

