---
id: 9053
title: 'Perf: Optimize CountryFlag to Prevent Grid Reflows'
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-08T18:10:13Z'
updatedAt: '2026-02-08T18:27:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9053'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T18:27:54Z'
---
# Perf: Optimize CountryFlag to Prevent Grid Reflows

The `Neo.component.CountryFlag` component has been identified as the source of "Forced Reflow" violations during Grid scrolling.
The current implementation switches the VDOM tag between `img` and `span` depending on whether a flag URL is available. This triggers frequent node removal/insertion during scrolling, which, combined with the lack of explicit dimension attributes on the `img` tag, causes layout thrashing.

**Optimization Strategy:**
1.  **CSS Containment:** Apply `contain: strict` to `.neo-country-flag` (the container) to isolate layout calculations.
2.  **Stable VDOM Structure:** Instead of swapping tags (`img` <-> `span`), maintain a stable DOM structure to avoid `removeNode`/`insertNode` operations.
    *   **Proposed Structure:** Always render an `img` tag. If no flag is available, set `src` to a transparent pixel (or handle via CSS visibility) and potentially toggle a class like `.neo-country-placeholder`.
3.  **Explicit Dimensions:** Add `width="20"` and `height="20"` attributes to the `img` VDOM node to prevent layout shifts during image loading.

**Implementation Steps:**
1.  Modify `resources/scss/src/component/CountryFlag.scss`: Add `contain: strict` to the main wrapper.
2.  Modify `src/component/CountryFlag.mjs`:
    *   Refactor `afterSetLocation` to maintain a stable `img` tag.
    *   Add explicit `width` and `height` attributes to the `img` config.
    *   Handle the "no flag" state by hiding the image or using a placeholder source, avoiding tag replacement.

## Timeline

- 2026-02-08T18:10:13Z @tobiu added the `bug` label
- 2026-02-08T18:10:13Z @tobiu added the `ai` label
- 2026-02-08T18:10:14Z @tobiu added the `performance` label
- 2026-02-08T18:20:58Z @tobiu referenced in commit `5ae1d37` - "perf: Optimize CountryFlag layout stability (#9053)"
- 2026-02-08T18:25:27Z @tobiu referenced in commit `f5feddd` - "perf: Finalize CountryFlag optimization with cleanup and comments (#9053)"
### @tobiu - 2026-02-08T18:25:38Z

**Input from Gemini 3 Pro:**

> ✦ **Final Optimization Strategy:**
> 
> To resolve the "Forced Reflow" violations caused by the CountryFlag component during rapid grid scrolling, we implemented a "Stable DOM" architecture.
> 
> 1.  **Stable VDOM Structure:**
>     *   The component now *always* renders an `<img>` tag, regardless of whether a flag URL exists.
>     *   Previously, switching between `<img>` (flag) and `<span>` (placeholder) triggered `removeNode` / `insertNode` operations, causing layout thrashing.
>     *   Now, we toggle `visibility: hidden` and remove the `src` attribute when no flag is present. This is a zero-layout-cost operation (paint only).
> 
> 2.  **Layout Isolation:**
>     *   Applied `contain: layout paint style;` to the `.neo-country-flag` wrapper in SCSS.
>     *   This isolates the component's internal layout reflows from the parent grid row.
>     *   **Note:** We avoided `contain: strict` (which includes `size`) because the component relies on its children for auto-sizing, and `strict` would have collapsed it to 0px height.
> 
> 3.  **Explicit Dimensions:**
>     *   The `img` tag now has explicit `width="20"` and `height="20"` attributes in the VDOM to prevent layout shifts during image loading.
> 
> **Results:**
> Tests confirm that removing the tag-swapping logic eliminates the forced reflows, restoring 60fps scrolling performance even with mixed data (rows with and without flags).

- 2026-02-08T18:27:51Z @tobiu assigned to @tobiu
- 2026-02-08T18:27:54Z @tobiu closed this issue
- 2026-02-08T18:50:42Z @tobiu added parent issue #8930

