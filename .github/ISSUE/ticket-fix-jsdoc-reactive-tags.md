# Ticket: Add missing @reactive tags and fix config JSDoc for trailing underscores

GH ticket id: #7297

**Assignee:** tobiu
**Status:** Done

## Description
This ticket addresses issues with missing `@reactive` JSDoc tags and incorrect JSDoc for reactive configs where the trailing underscore was omitted.
The `add-reactive-tags` script was used to automatically insert missing `@reactive` tags into `src/component/Toast.mjs`, `src/dashboard/Container.mjs`, and `src/grid/Container.mjs`.
Additionally, JSDoc comments for `iconCls_` and `position_` in `src/component/Toast.mjs` were corrected to include the trailing underscore in their `@member` tags, ensuring proper parsing by `neo-jsdoc-x`.

## Files Modified:
* `src/component/Toast.mjs`
* `src/dashboard/Container.mjs`
* `src/grid/Container.mjs`

## Labels:
`bug`, `documentation`, `tooling`
