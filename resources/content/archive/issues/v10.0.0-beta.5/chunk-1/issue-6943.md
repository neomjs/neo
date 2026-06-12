---
id: 6943
title: Implement Hierarchical `static config` Value Merging based on `configDescriptors` in `Neo.setupClass`
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-04T18:47:42Z'
updatedAt: '2025-07-04T19:31:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6943'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-04T19:31:12Z'
---
# Implement Hierarchical `static config` Value Merging based on `configDescriptors` in `Neo.setupClass`

**Is your feature request related to a problem? Please describe.**
When `Neo.setupClass` processes the class hierarchy, `static config` values from parent classes are currently overwritten by those from child classes if a config property with the same name exists. This prevents the intended hierarchical merging of config *values* based on the `merge` strategy defined in their respective `configDescriptors`.

For example, if `Component.Base` defines `style_` with a `merge: 'shallow'` descriptor:
```javascript
        style_: {
            [isDescriptor]: true,
            merge         : 'shallow',
            value         : null
        },
```
And then `MyComponent` extends `Component.Base` with `static config = {style: {color: "red"}}`, and `MyEnhancedComponent` extends `MyComponent` with `static config = {style: {backgroundColor: "blue"}}`. The desired outcome is that `MyEnhancedComponent`'s final `style` config should be `{color: "red", backgroundColor: "blue"}` due to the inherited `shallow` merge strategy. However, the current `Object.assign(config, cfg)` in `Neo.setupClass` would simply overwrite the `style` property, resulting in `{backgroundColor: "blue"}` and losing the `color: "red"` from `MyComponent`.

**Describe the solution you'd like**
The `Neo.setupClass` method in `src/Neo.mjs` should be modified to perform hierarchical merging of `static config` values based on the `merge` strategy defined in their `configDescriptors`. As `Neo.setupClass` traverses the class prototype chain, when merging the `static config` (`cfg`) of the current class into the accumulated `config` object, it should:
1.  Identify if the config property has a corresponding `configDescriptor` (which would have been collected from the highest class in the hierarchy that defined it).
2.  If a `merge` strategy is defined in the descriptor, apply that strategy using `Neo.mergeConfig` to combine the existing `config` value with the `cfg` value.
3.  If no `merge` strategy is defined, or if the values are not objects (and thus `shallow`/`deep` merges are not applicable), it should default to replacement.

This ensures that `static config` values are merged correctly across the class hierarchy, respecting the defined `merge` strategies.

**Describe alternatives you've considered**
The current "overwrite" behavior is the alternative, which leads to the described problem. This proposed solution directly addresses the need for hierarchical value merging in `static config`.

**Additional context**
This change is crucial for the predictability and correctness of how `static config` values are inherited and combined across the class hierarchy. It allows developers to define complex default configurations that are intelligently merged by subclasses, rather than simply being overwritten. This is distinct from instance-level config merging (handled by `Base.mjs#mergeConfig`), as this change focuses on the final `static config` object that `Neo.setupClass` produces.

## Timeline

- 2025-07-04T18:47:43Z @tobiu assigned to @tobiu
- 2025-07-04T18:47:44Z @tobiu added the `enhancement` label
- 2025-07-04T18:54:05Z @tobiu changed title from **Ensure Correct `merge` Strategy Inheritance for Config Values Across Class Hierarchy** to **Implement Hierarchical `static config` Value Merging based on `configDescriptors` in `Neo.setupClass`**
- 2025-07-04T19:31:07Z @tobiu referenced in commit `b3cb219` - "Implement Hierarchical static config Value Merging based on configDescriptors in Neo.setupClass #6943"
- 2025-07-04T19:31:12Z @tobiu closed this issue

