---
id: 7737
title: Create Playwright Component Test for Neo.component.Label
state: OPEN
labels:
  - enhancement
  - ai
  - testing
assignees:
  - Alachi24
createdAt: '2025-11-10T20:25:50Z'
updatedAt: '2025-11-10T21:03:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7737'
author: tobiu
commentsCount: 3
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Playwright Component Test for Neo.component.Label

This ticket is to create a new Playwright-based component test for `Neo.component.Label`.

This test plan was generated using the AI-Native workflow defined in the "Cookbook Epic" and will serve as the acceptance criteria for the implementation. The test should be created in a new file `test/playwright/component/component/Label.spec.mjs` and follow the "Empty Viewport" architecture.

## Acceptance Criteria

### 1. Inherited Behavior Tests (from Neo.component.Base & Neo.component.Abstract)

- [ ] **`appName` config:** Test that the `appName` config is correctly set and accessible.
- [ ] **`bind` config:** Test that data binding works correctly with a state provider (if applicable).
- [ ] **`cls` & `baseCls` configs:** Test that `baseCls` (`neo-label`) and custom `cls` values are correctly applied to the component's root element.
- [ ] **`data` config:** Test that the `data` config correctly reflects merged data from parent state providers.
- [ ] **`disabled` config:** Test that setting `disabled: true` adds the `.neo-disabled` class and prevents user interaction.
- [ ] **`height`, `width`, `minHeight`, `maxHeight`, `minWidth`, `maxWidth` configs:** Test that dimension configs are correctly applied to the component's style.
- [ ] **`hidden` config:** Test that setting `hidden: true` removes the component from the DOM (using `removeDom` hideMode) or sets `visibility: hidden` (using `visibility` hideMode).
- [ ] **`html` config:** Test that the `html` config correctly sets the innerHTML of the component.
- [ ] **`id` config:** Test that the component's unique ID is correctly set and used in the DOM.
- [ ] **`isLoading` config:** Test that setting `isLoading: true` displays a loading mask with the `neo-load-mask` and `neo-masked` classes.
- [ ] **`keys` config:** Test that keyboard navigation is correctly set up (if applicable).
- [ ] **`mounted` config:** Test that the `mounted` config is true after the component is mounted to the DOM.
- [ ] **`plugins` config:** Test that plugins are correctly instantiated and applied (if applicable).
- [ ] **`reference` config:** Test that the component can be accessed via its reference.
- [ ] [ ] **`role` config:** Test that the `role` attribute is correctly applied to the component's root element.
- [ ] **`scrollable` config:** Test that setting `scrollable: true` adds the `neo-scrollable` class and applies `overflow: auto` style.
- [ ] **`stateProvider` config:** Test that a state provider can be attached and its data accessed.
- [ ] **`style` config:** Test that custom inline styles are correctly applied to the component's root element.
- [ ] **`tag` config:** Test that the component's root HTML tag can be changed.
- [ ] **`text` config:** Test that the `text` config correctly sets the textContent of the component.
- [ ] **`theme` config:** Test that theme classes are correctly applied and inherited.
- [ ] **`tooltip` config:** Test that a tooltip is correctly created and displayed on hover.
- [ ] **`ui` config:** Test that custom UI classes are correctly applied (e.g., `neo-label-my-ui`).
- [ ] **`windowId` config:** Test that the `windowId` is correctly set and used.
- [ ] **`wrapperCls` & `wrapperStyle` configs:** Test that wrapper classes and styles are correctly applied.

### 2. Component-Specific Feature Tests (Neo.component.Label)

- [ ] **`baseCls`:** Verify that the `neo-label` class is always present on the component's root element.
- [ ] **`tag`:** Verify that the component renders as a `<label>` HTML element by default.
- [ ] **`text` config:** Verify that the `text` config directly sets the `textContent` of the `<label>` element.
- [ ] **`user-select: none`:** Verify that the `user-select: none` CSS property is applied to the label, preventing text selection.
- [ ] **`white-space: nowrap`:** Verify that the `white-space: nowrap` CSS property is applied to the label, preventing text wrapping.

## Timeline

- 2025-11-10T20:25:51Z @tobiu added the `enhancement` label
- 2025-11-10T20:25:51Z @tobiu added parent issue #7435
- 2025-11-10T20:25:51Z @tobiu added the `ai` label
- 2025-11-10T20:25:52Z @tobiu added the `testing` label
- 2025-11-10T20:26:59Z @tobiu cross-referenced by PR #7734
### @Alachi24 - 2025-11-10T20:57:47Z

@tobiu I'd like to work on this, kindly assign this to me.
Also for clarity, i'd love to have any prior instruction to use as direction to work on this.

- 2025-11-10T20:58:04Z @tobiu assigned to @Alachi24
### @tobiu - 2025-11-10T21:00:49Z

i would recommend looking at existing component based tests, e.g.:
https://github.com/neomjs/neo/blob/dev/test/playwright/component/button/Base.spec.mjs

=> the setup is almost 1:1 => using the empty viewport, using remote method access to tell the app worker to render & mount a label into a specific parent div (viewport).

### @Alachi24 - 2025-11-10T21:03:48Z

Acceptable... Thank you 

- 2025-11-13T14:07:23Z @Alachi24 referenced in commit `b2d74a6` - "docs: add playwright test for Neo.component.label (#7737)"
- 2025-11-13T14:16:52Z @Alachi24 cross-referenced by PR #7768
- 2025-11-15T20:53:25Z @Alachi24 referenced in commit `822b65c` - "docs: update on add playwright test for Neo.component.label (#7737)"

