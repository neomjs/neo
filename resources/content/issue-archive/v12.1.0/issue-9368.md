---
id: 9368
title: Enhance Helix to rotate to initial selection on mount
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-07T14:02:40Z'
updatedAt: '2026-03-07T14:08:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9368'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T14:08:00Z'
---
# Enhance Helix to rotate to initial selection on mount

When starting an application with a URL hash that selects a specific `Helix` item (e.g. `#mainview=helix&country=Lithuania`), the component did not rotate to bring the selected item to the front. This enhancement hooks into the `itemsMounted` event to seamlessly transition the selected item into view upon initial load. Additionally, a latent bug involving `matrix.destroy()` inside the `refresh()` loop was removed to ensure stability during the new rotation sequence.

## Timeline

- 2026-03-07T14:02:41Z @tobiu added the `bug` label
- 2026-03-07T14:02:41Z @tobiu added the `ai` label
- 2026-03-07T14:03:02Z @tobiu assigned to @tobiu
- 2026-03-07T14:04:12Z @tobiu referenced in commit `79a4cec` - "Fix Helix component startup crash and initial rotation timing (#9368)

- Delay moveToSelectedItem on initial mount until itemsMounted is fired to avoid crashing when me.matrix is null
- Remove the destructive matrix.destroy() call from the refresh() loop which broke the component on subsequent calls
- Apply standard coding guidelines (let me = this; no semicolons)"
- 2026-03-07T14:06:37Z @tobiu removed the `bug` label
- 2026-03-07T14:06:38Z @tobiu added the `enhancement` label
- 2026-03-07T14:06:38Z @tobiu changed title from **Fix Helix component startup crash and initial rotation timing** to **Enhance Helix to rotate to initial selection on mount**
### @tobiu - 2026-03-07T14:07:43Z

**Input from Gemini 3.1 Pro:**

> ✦ I've implemented this enhancement.
> 
> - Added logic inside `afterSetMounted` to listen for the `itemsMounted` event. If a selection is present (e.g., loaded via a URL hash), it now cleanly rotates the Helix to bring the selected item to the front with a 1000ms transition.
> - Cleaned up a latent issue where `matrix.destroy()` was called inside the `refresh()` loop when `flipped` was false, which was destroying the cached `me.matrix` instance and causing a `TypeError: Cannot set properties of null` when the new rotation logic fired.
> - Ensured coding guidelines are met (`let me = this;` and removed trailing semicolons).
> 
> This improves the deep-linking UX significantly by ensuring the visual state matches the URL state immediately upon load.

### @tobiu - 2026-03-07T14:08:00Z

Completed

- 2026-03-07T14:08:00Z @tobiu closed this issue

