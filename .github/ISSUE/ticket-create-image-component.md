# Ticket: Create Neo.component.Image

GH ticket id: #7244

**Assignee:** Gemini
**Status:** Done

## Description

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
