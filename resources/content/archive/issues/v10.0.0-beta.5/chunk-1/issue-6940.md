---
id: 6940
title: Enhance `Neo.mergeConfig` for Robust Type Handling
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-04T17:33:51Z'
updatedAt: '2025-07-04T17:34:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6940'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-04T17:34:31Z'
---
# Enhance `Neo.mergeConfig` for Robust Type Handling

**Is your feature request related to a problem? Please describe.**
The existing config system had a subtle issue where `Neo.mergeConfig` method, responsible for merging default and instance config values, previously attempted `shallow` or `deep` merge operations even when the `defaultValue` or `instanceValue` were not objects. This could lead to semantically incorrect operations or potential runtime errors when dealing with primitive types, as object-specific merge logic is not applicable to non-object values.

**Describe the solution you'd like**
The `Neo.mergeConfig` method in `src/Neo.mjs` has been enhanced to ensure more robust type handling.
1.  It now explicitly checks the types of `defaultValue` and `instanceValue`.
2.  The `shallow` and `deep` merge strategies are now only applied if *both* `defaultValue` and `instanceValue` are objects.
3.  If either value is not an object, the method will fall back to the default 'replace' strategy, or apply a custom function strategy if one is provided.
This ensures that merge operations are semantically correct and prevents attempts to perform object-specific merges on non-object types.

**Describe alternatives you've considered**
The previous implementation was less strict about type checking, which led to the identified problem. The current solution directly addresses this by adding explicit type checks before applying object-specific merge logic. No other alternatives were considered as this is a direct refinement of the existing merge behavior.

**Additional context**
This enhancement improves the reliability and predictability of the config merging process within the Neo.mjs framework, ensuring that `shallow` and `deep` merges are only performed on appropriate data types.

## Timeline

- 2025-07-04T17:33:51Z @tobiu assigned to @tobiu
- 2025-07-04T17:33:52Z @tobiu added the `enhancement` label
- 2025-07-04T17:34:21Z @tobiu referenced in commit `bd0da0d` - "Enhance Neo.mergeConfig for Robust Type Handling #6940"
- 2025-07-04T17:34:32Z @tobiu closed this issue

