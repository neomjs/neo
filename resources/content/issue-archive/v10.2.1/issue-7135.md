---
id: 7135
title: 'Feature: Enhance button.Base `text` config to support VDOM `cn` arrays'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-30T12:37:48Z'
updatedAt: '2025-07-30T12:39:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7135'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-30T12:39:07Z'
---
# Feature: Enhance button.Base `text` config to support VDOM `cn` arrays

This ticket documents a significant enhancement to `Neo.button.Base`, allowing its `text` config to accept a VDOM `cn` (children) array in addition to a standard string. This provides a cleaner, more secure, and more performant way to define complex button content.

## Problem

Previously, creating a button with mixed content (e.g., an icon or styled text next to plain text) required workarounds. A temporary solution involved parsing the `text` string for HTML, which was convenient but had several drawbacks:

- It was architecturally inconsistent with the framework's VDOM-first approach.
- It relied on setting `innerHTML`, which is a potential Cross-Site Scripting (XSS) security risk.
- It was inefficient, as any change required replacing the entire button content instead of allowing for granular updates.

## Solution

The `afterSetText` method in `src/button/Base.mjs` has been updated to intelligently handle its `value`:

- If the `value` is a `String`, it is assigned to the `textNode.text` property as before.
- If the `value` is an `Array`, it is treated as a VDOM `cn` array and assigned to the `textNode.cn` property.

This allows developers to define rich button content using a standard VDOM structure.

### Example

```javascript
// Before (using an HTML string hack, plus regression issue in v10)
{
    handler: 'onSeriesButtonClick',
    series : 'active',
    text   : '<span style="color: #64b5f6">●</span> Active'
}

// After (using a clean VDOM array)
{
    handler: 'onSeriesButtonClick',
    series : 'active',
    text   : [{tag: 'span', style: {color: '#64b5f6'}, text: '●'}, {vtype: 'text', text: ' Active'}]
}
```

## Key Advantages

1.  **Cleaner & More Consistent API:** This change aligns `button.Base` with the rest of the framework. Developers can now compose button content using the same declarative VDOM structure they use everywhere else, making the API more predictable and idiomatic.

2.  **XSS Secure by Default:** By processing a VDOM structure instead of an HTML string, the framework builds the DOM programmatically. This completely avoids the use of `innerHTML` for the button's content, eliminating the risk of XSS attacks from malicious strings.

3.  **Enables Granular Delta Updates:** When the button's content is part of the VDOM tree, the framework's diffing engine can perform highly efficient delta updates. If only one part of the button's content changes (e.g., a number in a label), only that specific text node will be updated in the DOM, rather than re-rendering the entire button's content. This significantly improves rendering performance for dynamic buttons.

## Timeline

- 2025-07-30T12:37:48Z @tobiu assigned to @tobiu
- 2025-07-30T12:37:50Z @tobiu added the `enhancement` label
- 2025-07-30T12:38:20Z @tobiu referenced in commit `28e1ef9` - "Feature: Enhance button.Base text config to support VDOM cn arrays #7135"
- 2025-07-30T12:39:07Z @tobiu closed this issue

