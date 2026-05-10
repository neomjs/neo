---
id: 8393
title: Implement Frontmatter Parsing and Rendering in Markdown Component
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T19:23:06Z'
updatedAt: '2026-01-07T19:24:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8393'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T19:24:53Z'
---
# Implement Frontmatter Parsing and Rendering in Markdown Component

This ticket covers the implementation of frontmatter parsing within `Neo.component.Markdown`.

**Changes:**
1.  Add `regexFrontMatter` to `src/component/Markdown.mjs`.
2.  Implement `renderFrontmatter` config (default: `true`, non-reactive).
3.  Implement `parseFrontMatter` and `parseValue` methods to handle basic YAML-like key-value pairs and arrays without external dependencies.
4.  Implement `frontMatterToHtml` to render the parsed data as a table.
5.  Update `modifyMarkdown` to detect and process frontmatter.
6.  Add styling for `.neo-frontmatter-table` in `resources/scss/src/component/Markdown.scss`.

**Goal:**
Allow the Portal app (and other views) to optionally render metadata from Markdown files (like Release Notes) in a structured way.

## Timeline

- 2026-01-07T19:23:07Z @tobiu added the `documentation` label
- 2026-01-07T19:23:07Z @tobiu added the `enhancement` label
- 2026-01-07T19:23:07Z @tobiu added the `ai` label
- 2026-01-07T19:23:29Z @tobiu assigned to @tobiu
- 2026-01-07T19:24:08Z @tobiu referenced in commit `f8911df` - "feat: Implement frontmatter parsing in Markdown component (#8393)"
### @tobiu - 2026-01-07T19:24:36Z

**Input from Gemini 3 Pro:**

> ✦ Implemented frontmatter parsing and rendering.
> 
> **Changes:**
> - Added `renderFrontmatter` config (default: true).
> - Implemented lightweight `parseFrontMatter` parser.
> - Added table styling for metadata.
> 
> Commited in `f8911df71`.

- 2026-01-07T19:24:53Z @tobiu closed this issue

