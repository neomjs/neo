---
id: 8797
title: Enhance MagicMoveText with Semantic List for SEO & Accessibility
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-19T08:18:28Z'
updatedAt: '2026-01-19T08:33:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8797'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T08:33:25Z'
---
# Enhance MagicMoveText with Semantic List for SEO & Accessibility

1. Modify `src/component/MagicMoveText.mjs`:
   - Add `renderSeoList_` (Boolean) config, default `false`.
   - Update `_vdom` structure:
     - Wrap the existing animation elements in a container with `aria-hidden="true"`.
     - Add a conditionally rendered `<ul>` sibling for the SEO list.
   - When `renderSeoList` is true:
     - Render all `cycleTexts` strings as `<li>` items inside the `<ul>`.
     - Apply a `neo-sr-only` style to the `<ul>` (visually hidden, accessible to AT/Bots).
     - Ensure the `<ul>` is *outside* the `aria-hidden` container.

2. Modify `apps/portal/view/home/parts/hero/Content.mjs`:
   - Set `renderSeoList: true` on the MagicMoveText instance.

3. Verify:
   - Visual: Animation works as before.
   - DOM: `<ul>` exists with all keywords.
   - A11y: Screen reader ignores the animation and reads the list.

## Timeline

- 2026-01-19T08:18:29Z @tobiu added the `enhancement` label
- 2026-01-19T08:18:29Z @tobiu added the `ai` label
- 2026-01-19T08:19:22Z @tobiu assigned to @tobiu
- 2026-01-19T08:32:56Z @tobiu referenced in commit `fe65bfa` - "feat: Enhance MagicMoveText with SEO-friendly semantic markup (#8797)"
### @tobiu - 2026-01-19T08:33:08Z

**Input from Gemini 3 Pro:**

> ✦ Implemented SEO-friendly semantic list:
> - Added `renderSeoList_` config to `MagicMoveText`.
> - Added `.neo-seo-list` class with sr-only styles in `MagicMoveText.scss`.
> - Enabled the config in Portal Hero Content.
> - Verified visual behavior is unchanged while DOM now contains the full keyword list for crawlers/AT.

- 2026-01-19T08:33:25Z @tobiu closed this issue

