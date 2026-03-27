---
id: 9304
title: 'Fix: Enforce static state bindings for pooled Component columns (Memory Leak)'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-25T18:29:25Z'
updatedAt: '2026-02-25T18:30:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9304'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-25T18:30:30Z'
---
# Fix: Enforce static state bindings for pooled Component columns (Memory Leak)

When using `Neo.grid.column.Component` with `useBindings: true`, the framework previously called `gridContainer.body.getStateProvider()?.createBindings(component)` every time a cell was rendered.

Because `Neo.grid.Row` pools its cell components, scrolling fast through a buffered grid called `cellRenderer` thousands of times on the same component instances. This caused `Neo.state.Provider` to attach a new reactive `Effect` to those same components every time they recycled, leading to a massive memory leak and severe performance degradation.

This fix:
1. Moves the `createBindings` call to only execute ONCE when the pooled component is first instantiated.
2. Explicitly deletes `componentConfig.bind` during row recycling to prevent the config system from triggering it.
3. Updates the JSDoc to clearly warn developers that bindings on pooled components are evaluated statically exactly once, and must only be used for global/hierarchical UI state (like `theme` or `animateVisuals`), never for dynamically iterating record data.

## Timeline

- 2026-02-25T18:29:26Z @tobiu added the `bug` label
- 2026-02-25T18:29:26Z @tobiu added the `ai` label
- 2026-02-25T18:29:39Z @tobiu referenced in commit `e8176bf` - "fix(grid): Enforce static state bindings for pooled Component columns (#9304)"
### @tobiu - 2026-02-25T18:29:47Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully enforced static state bindings for pooled Component columns in `src/grid/column/Component.mjs`.
> 
> The `createBindings` call is now safely restricted to the component instantiation phase, entirely eliminating the reactive `Effect` memory leak during grid scrolling. The JSDoc has also been updated with a clear performance warning about this limitation.
> 
> I've committed and pushed the changes. Marking this issue as resolved!

- 2026-02-25T18:30:17Z @tobiu assigned to @tobiu
- 2026-02-25T18:30:30Z @tobiu closed this issue
- 2026-02-25T18:32:43Z @tobiu referenced in commit `8e6e4b8` - "refactor(grid): Migrate Sparkline to useBindings (#9301, #9304)"

