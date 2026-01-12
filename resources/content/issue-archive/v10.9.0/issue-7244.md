---
id: 7244
title: Create Neo.component.Image
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-23T15:22:41Z'
updatedAt: '2025-09-23T15:29:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7244'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-23T15:29:47Z'
---
# Create Neo.component.Image

Create a new class, `Neo.component.Image`, to provide a classic Object-Oriented Programming (OOP) interface for the `<img>` HTML tag. This component will serve as a foundational building block and demonstrate best practices for reactive configs.

## Rationale

While an `<img>` tag can be created directly in a VDOM tree, a dedicated component class offers significant advantages:

-   **Reactivity:** It provides reactive `src` and `alt` configs, allowing these properties to be updated via data binding.
-   **Lazy Loading:** The reactive `src` config is a key enabler for advanced behaviors like lazy loading images (e.g., based on an Intersection Observer) by updating the `src` at runtime.
-   **Encapsulation:** It encapsulates image-specific logic and provides a clear, reusable API.

## Scope of Work

1.  Create a new file: `src/component/Image.mjs`.
2.  The new `Image` class should extend `Neo.component.Base`.
3.  The `static config` should include:
    -   `className`: `Neo.component.Image`
    -   `ntype`: `image`
    -   `tag`: `'img'` (This will inherit reactivity from `Neo.component.Base`)
    -   `alt_`: `null` (reactive)
    -   `src_`: `null` (reactive)
4.  Implement `afterSetAlt()` and `afterSetSrc()` hooks to update the component's VDOM when the `alt` and `src` configs are changed.

## Acceptance Criteria

-   The `Neo.component.Image` class is created at the specified path.
-   The component correctly renders an `<img>` tag.
-   Changing the `src` and `alt` configs programmatically updates the rendered `<img>` tag's attributes.

## Timeline

- 2025-09-23T15:22:41Z @tobiu assigned to @tobiu
- 2025-09-23T15:22:42Z @tobiu added the `enhancement` label
- 2025-09-23T15:28:26Z @tobiu referenced in commit `6bcc85d` - "Create Neo.component.Image #7244"
- 2025-09-23T15:29:47Z @tobiu closed this issue

