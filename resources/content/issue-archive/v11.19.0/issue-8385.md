---
id: 8385
title: Add support for 'text' language in Markdown code blocks
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T14:26:38Z'
updatedAt: '2026-01-07T14:36:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8385'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T14:36:47Z'
---
# Add support for 'text' language in Markdown code blocks

The `NeuralLink.md` guide contains an ASCII tree diagram that lacks syntax highlighting and consistent styling because it is in a plain code block.

To resolve this, we should add support for a `text` or `plaintext` language in our Markdown processing pipeline.

**Tasks:**
1.  **Update `buildScripts/buildHighlightJs.mjs`:** Add `plaintext` to the `languages` array.
2.  **Update `src/component/Markdown.mjs`:** Update `regexReadonly` to include `text` (and map it to `plaintext` for highlight.js if needed, though `highlightAuto` might handle it).
3.  **Update `learn/guides/mcp/NeuralLink.md`:** Change the ASCII tree block to use ````text readonly`.

This will ensure the block is rendered with the same `pre.hljs` styling as other code blocks.

## Timeline

- 2026-01-07T14:26:39Z @tobiu added the `documentation` label
- 2026-01-07T14:26:39Z @tobiu added the `enhancement` label
- 2026-01-07T14:26:39Z @tobiu added the `ai` label
- 2026-01-07T14:30:17Z @tobiu assigned to @tobiu
- 2026-01-07T14:30:50Z @tobiu referenced in commit `8802e49` - "Add support for 'text' language in Markdown code blocks #8385"
- 2026-01-07T14:36:47Z @tobiu closed this issue

