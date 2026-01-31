---
id: 7677
title: Create Playwright Component Test for Neo.form.field.Password
state: OPEN
labels:
  - enhancement
  - stale
  - ai
assignees: []
createdAt: '2025-10-27T14:00:18Z'
updatedAt: '2026-01-30T03:37:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7677'
author: tobiu
commentsCount: 1
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Playwright Component Test for Neo.form.field.Password

This ticket is to create a new Playwright-based component test for `Neo.form.field.Password`.

This test plan was generated using the AI-Native workflow defined in the "Cookbook Epic" and will serve as the acceptance criteria for the implementation. The test should be created in a new file `test/playwright/component/form/field/Password.spec.mjs` and follow the "Empty Viewport" architecture.

## Component Analysis

The `Neo.form.field.Password` component extends `Neo.form.field.Text` and only overrides the `inputType` configuration to set it to `'password'`. This means it inherits all functionality from the text field but renders as a password input type, which masks user input.

## Acceptance Criteria

### 1. Inherited Behavior Tests (from Neo.form.field.Text)

- [ ] **disabled config:** Test that setting `disabled: true` adds the `.neo-disabled` class, prevents user interaction, and disables the input element.
- [ ] **hidden config:** Test that setting `hidden: true` removes the component from the DOM (using the default `removeDom` hideMode).
- [ ] **cls & style configs:** Test that custom classes and inline styles are correctly applied to the component's root element.
- [ ] **value config:** Test setting the field's value programmatically and verifying the input element reflects the change.
- [ ] **isDirty flag:** Test that the `isDirty` flag is correctly set when the value changes from its original value.
- [ ] **clearable config:** Test that the clear trigger appears when the field has value and `clearable: true`. Test that clicking the trigger clears the value.
- [ ] **labelText & labelPosition configs:** Test that changing `labelPosition` applies the correct `.label-[position]` class. For `labelPosition: 'inline'`, test that the label animation works correctly on focus and when content is present.
- [ ] **Validation (minLength, maxLength, required):** Test that entering a value that violates a validation rule correctly applies the `.neo-invalid` class and that an error message is displayed.
- [ ] **Triggers:** Test that custom triggers can be added and that they are interactive.
- [ ] **Styling States:** Test that `.neo-focus` and `.neo-hovered` classes are applied correctly on user interaction.

### 2. Password-Specific Feature Tests

- [ ] **inputType configuration:** Verify that the underlying HTML input element has `type="password"` attribute set.
- [ ] **Password masking:** Test that entered text is visually masked (displayed as dots or asterisks) while the actual value is preserved.
- [ ] **Value persistence:** Ensure that even though the display is masked, the actual value property maintains the clear text.
- [ ] **Copy/paste behavior:** Test that copy operations from the password field don't expose clear text (browser-dependent behavior).
- [ ] **Password visibility toggle:** If the component supports a visibility toggle trigger (common in password fields), test that clicking it toggles between masked and clear text display.

### 3. Accessibility Tests

- [ ] **Screen reader compatibility:** Verify that the password field is properly announced as a password field to screen readers.
- [ ] **ARIA attributes:** Test that appropriate ARIA attributes are present for accessibility.
- [ ] **Keyboard navigation:** Ensure the field can be focused and interacted with using keyboard navigation.

### 4. Security Considerations

- [ ] **Autocomplete attributes:** Verify that appropriate `autocomplete` attributes are set (e.g., `autocomplete="current-password"` or `autocomplete="new-password"`).
- [ ] **No value exposure:** Ensure that the component doesn't inadvertently expose the password value through DOM attributes or properties.

### 5. Integration Tests

- [ ] **Form submission:** Test that the password value is correctly submitted when contained within a form.
- [ ] **Data binding:** Verify that data binding works correctly with the password field's masked display.

## Test Implementation Notes

- Use Playwright's `page.locator()` to target the password input element specifically
- Verify password masking by checking that the displayed value differs from the actual value
- Test both programmatic value setting and user input scenarios
- Ensure tests run in isolated viewports to prevent interference

## File Location

The test should be created at: `test/playwright/component/form/field/Password.spec.mjs`

## Timeline

- 2025-10-27T14:00:20Z @tobiu added the `enhancement` label
- 2025-10-27T14:00:20Z @tobiu added the `ai` label
- 2025-10-27T14:00:20Z @tobiu added parent issue #7435
- 2025-10-27T14:01:15Z @tobiu cross-referenced by PR #7676
### @github-actions - 2026-01-30T03:37:14Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-01-30T03:37:14Z @github-actions added the `stale` label

