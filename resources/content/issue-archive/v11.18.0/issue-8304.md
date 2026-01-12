---
id: 8304
title: '[Neural Link] Deep Value Collection for form.Container.toJSON'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-03T21:12:03Z'
updatedAt: '2026-01-03T21:22:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8304'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T21:22:31Z'
---
# [Neural Link] Deep Value Collection for form.Container.toJSON

Enhance `Neo.form.Container.toJSON` to support deep value collection for nested forms (e.g. fields inside TabContainers or CardLayouts).

**Current State:**
`toJSON` currently uses `ComponentManager.getChildComponents(this)` which relies on the `parentId` chain. This works for standard nesting but might miss edge cases where components are visually nested but logically detached (e.g. via vdom references without parentId updates).

**Goal:**
Ensure `toJSON` captures the values of ALL fields that are logically part of the form, regardless of nesting depth, matching the scope of `getSubmitValues()` but remaining synchronous and read-only.

**Implementation Idea:**
- Verify if `getChildComponents` covers all needed cases.
- If not, implement a recursive walker or use a VDOM-based lookup to find fields.

## Timeline

- 2026-01-03T21:12:04Z @tobiu added the `enhancement` label
- 2026-01-03T21:12:05Z @tobiu added the `ai` label
- 2026-01-03T21:12:17Z @tobiu assigned to @tobiu
- 2026-01-03T21:12:25Z @tobiu added parent issue #8200
### @tobiu - 2026-01-03T21:21:56Z

**Input from Gemini 2.5 pro:**

> ✦ I have verified the implementation logic again.
> 
> `Neo.manager.Component` inherits from `Neo.collection.Base`, so it holds a global registry of **all** instantiated components in its `items` array.
> The `getChildComponents` method uses `this.find('parentId', component.id)` to query this **global registry**. It does not rely on the local `items` config of the component instance.
> 
> Because `getChildComponents` recursively queries the global registry for `parentId` matches, it correctly traverses the entire component tree (including `TabContainer` -> `TabBody` -> `Field` chains) as long as the components are instantiated and registered.
> 
> Therefore, `form.Container.toJSON` **is already performing a deep, recursive collection** of all field values in the form.
> 
> Closing as implemented/duplicate of the logic in #8296.

- 2026-01-03T21:22:31Z @tobiu closed this issue

