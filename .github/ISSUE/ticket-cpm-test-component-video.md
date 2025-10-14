---
title: Video Component Test Plan
labels: ['component', 'video', 'media', 'test-plan']
---
GH ticket id: #7489
**Assignee:** ritikrikm
**Status:** Done
## Description

This test plan outlines the necessary test cases for the `Neo.component.Video` component. It covers both the standard behaviors inherited from `Neo.component.Base` (such as configuration of `cls`, `style`, and visibility) and the functionality specific to a video player (such as autoplay, ghost element management, URL loading, and programmatic control via `play()` and `pause()`).

The tests are organized into **Inherited Behaviors** and **Component-Specific Behaviors**.

***

## Acceptance Criteria

### Inherited Behavior Tests (via `Neo.component.Base`)

These tests verify that standard component configurations are applied correctly to the main DOM element.

- [ ] **`hidden` / Visibility**: Verify setting `hidden: true` correctly hides the component (e.g., adds `display: none` or similar style/class) and that setting it to `false` makes it visible.
- [ ] **`cls` / Custom Classes**: Verify that custom classes specified via the `cls` config are added to the outer `.neo-video` DOM element.
- [ ] **`style` / Inline Styles**: Verify that custom styles specified via the `style` config are applied as inline styles to the outer `.neo-video` DOM element.
- [ ] **`id` / Custom ID**: Verify that a custom ID can be assigned to the component's main VDom node.
- [ ] **`baseCls`**: Verify the component's main element has the default base class `neo-video`.

***

### Component-Specific Behavior Tests

These tests cover the core functionality unique to the `Neo.component.Video` component.

#### Configuration and Initial Render

- [ ] **Default Render (No `url`)**: Verify that by default, the component renders the **ghost element** (`.neo-video-ghost`) which contains the play icon (`.fa-circle-play`), and the actual `<video>` element has `removeDom: true`.
- [ ] **`url` Loading**: Verify that setting the `url` config correctly adds a `<source>` tag inside the `<video>` element with the specified `src` attribute and the default `type` (`video/mp4`).
- [ ] **`type` Configuration**: Verify that a custom `type` config (e.g., `'video/ogg'`) is correctly applied to the `<source>` tag when the `url` is set.
- [ ] **`controls`**: Verify the `<video>` element is rendered with the `controls="true"` attribute by default.
- [ ] **`autoPlay` Enabled**:
    - [ ] Verify that if `autoPlay: true` is set, the component's internal `playing` state is set to `true` on construction.
    - [ ] Verify that the **ghost element is immediately hidden** (`removeDom: true`) and the `<video>` element is visible (`removeDom: false`).
    - [ ] Verify that the `<video>` element is rendered with `muted="true"` and `playsInline="true"` attributes to comply with browser autoplay policies (as implemented in `handleAutoplay`).

#### Interaction and State Management

- [ ] **Ghost Click / `play()`**: Verify that clicking the **ghost element** (or calling the `play()` method):
    - [ ] Sets the internal `playing` state to `true`.
    - [ ] Hides the **ghost element** (`.neo-video-ghost`).
    - [ ] Makes the actual `<video>` element visible (removes `removeDom: true`).
- [ ] **Programmatic `pause()`**: Verify that calling the `pause()` method:
    - [ ] Sets the internal `playing` state to `false`.
    - [ ] Hides the `<video>` element (`removeDom: true`).
    - [ ] Makes the **ghost element** visible (removes `removeDom: true`).
- [ ] **`afterSetPlaying` Behavior**: Verify that the `afterSetPlaying` method correctly toggles the `removeDom` property for both the `ghost` and `media` elements based on the new `playing` value, and triggers a component `update()`.

#### Error and Edge Case Handling

- [ ] **`url` Change**: Verify that changing the `url` dynamically (after initial render) correctly updates the `<source>` tag's `src` attribute inside the `<video>` element and triggers a component `update()`.
- [ ] **Empty/Null `url`**: Verify that setting `url` to `null` or an empty string does **not** cause an error and does not add a `<source>` tag to the `<video>` element (checked in `afterSetUrl`).
- [ ] **Autoplay without `url`**: Verify that if `autoPlay: true` but `url` is not set, the component's `playing` state is still set to `true`, and the ghost element is hidden, but the `<video>` element remains without a source (until a URL is provided later).