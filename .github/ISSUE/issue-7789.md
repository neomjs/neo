---
id: 7789
title: Create a utility for highlight.js line numbers
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-18T09:44:35Z'
updatedAt: '2025-11-18T09:45:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7789'
author: tobiu
commentsCount: 0
parentIssue: 7791
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create a utility for highlight.js line numbers

Following up on #7788, we need a way to add line numbers to the code blocks highlighted by `highlight.js` in a Node.js environment for SSR.

The current browser-based `highlightjs-line-numbers.js` plugin is not compatible with Node.js as it relies on the DOM.

## Plan

1.  Create a new utility `Neo.util.HighlightJsLineNumbers`, following the pattern of `Neo.core.IdGenerator`.
2.  The file will be located at `src/util/HighlightJsLineNumbers.mjs`.
3.  It will be a plain JavaScript object (not a class) wrapped with `Neo.gatekeep`.
4.  It will provide a method `addLineNumbers(html, options)` that takes an HTML string (from `highlight.js`) and returns a new HTML string with a table structure for line numbers.
5.  The implementation will be based on the Node.js-compatible version discussed in [this GitHub issue](https://github.com/yauhenipakala/highlightjs-line-numbers.js/issues/19#issuecomment-335563484), but will have no external dependencies (like lodash).
6.  The generated HTML structure should be compatible with the existing SCSS for line numbers.

## SCSS
```scss
// highlight-js line numbers styles
.hljs-ln {
    border-collapse: collapse;
    td {
        padding: 0;
    }

    /* for block of numbers */
    td.hljs-ln-numbers {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        -khtml-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;

        text-align: center;
        border-right: 1px solid #717171;
        vertical-align: top;
        padding-right: 5px;
    }

    /* for block of code */
    td.hljs-ln-code {
        padding-left: 10px;
    }
}

.hljs-ln-n:before {
    content: attr(data-line-number)
}
```

## Activity Log

- 2025-11-18 @tobiu added the `enhancement` label
- 2025-11-18 @tobiu added the `ai` label
- 2025-11-18 @tobiu assigned to @tobiu
- 2025-11-18 @tobiu cross-referenced by #7791

