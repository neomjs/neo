---
id: 6116
title: 'component.Base: vdom => flag => ref'
state: OPEN
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2024-11-18T11:03:03Z'
updatedAt: '2025-06-13T00:23:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6116'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# component.Base: vdom => flag => ref

minor breaking change.

inside the component tree, we are using `reference` as identifiers. inside the vdom tree we are using `flag`. this feels a bit inconsistent.

it might be confusing to use the exact same name (2 different trees, controller.getReference() will not search inside the vdom), so i think `ref` would be a good alternative.

## Timeline

- 2024-11-18T11:03:03Z @tobiu added the `enhancement` label
- 2024-11-18T11:03:03Z @tobiu assigned to @tobiu
### @github-actions - 2025-02-17T02:34:43Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-02-17T02:34:43Z @github-actions added the `stale` label
### @github-actions - 2025-03-03T02:37:46Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2025-03-03T02:37:46Z @github-actions closed this issue
- 2025-03-03T07:30:18Z @tobiu reopened this issue
- 2025-03-03T07:30:34Z @tobiu removed the `stale` label
- 2025-03-03T07:30:34Z @tobiu added the `no auto close` label
### @tobiu - 2025-03-03T07:30:48Z

this ticket is supposed to stay open.

### @tobiu - 2025-06-13T00:23:23Z

Input from Gemini:

Your proposal to change flag to ref within the vdom markup, despite it being a breaking change and necessitating the removal of flag, makes a lot of sense and I would strongly support it.

Here's why:

Unified Mental Model: This is the most compelling reason. Using ref consistently across the framework, whether you're referring to a component instance in the component tree (reference on a component config, then accessed via lookupReference) or a specific virtual DOM node within a component's vdom (ref property on a vdom node, then accessed via a helper method like getVdomNodeByRef), creates a much more cohesive and intuitive mental model for developers. "Ref" universally implies "I want a programmatic reference to this specific item."

Reduced Cognitive Load: While flag avoids immediate collision with reference, introducing a separate concept for a very similar purpose (getting a programmatic handle) can actually increase cognitive load in the long run. Unifying under ref simplifies the API surface developers need to learn and remember.

Familiarity for Newcomers: Many popular VDOM-based frameworks (like React) use ref for similar purposes (getting a reference to a DOM node or component). This familiar terminology could ease the onboarding process for developers coming from other ecosystems.

Improved Readability: ref is concise and widely understood in the context of getting references to UI elements.

Regarding the "breaking change" aspect:
You're correct that supporting both flag and ref simultaneously for the same purpose makes no sense. A clean break, deprecating flag entirely and migrating to ref, is the right approach. For a framework like Neo.mjs, which prioritizes architectural elegance and performance, occasional breaking changes that lead to significant long-term API improvements are often justifiable, provided they are clearly documented with migration paths.

Implementation Considerations:
If you make this change, it would be beneficial to:

Update the proposed getVdomNodeByFlag helper: Rename it to something like getVdomNodeByRef or queryVdomRef, to align with the new property name.
Clear Documentation: Explicitly state the deprecation of flag and the new usage of ref in migration guides and documentation, clearly distinguishing how ref is used in vdom vs. reference is used for component instances (if reference remains separate). However, the conceptual overlap is much smaller now.


