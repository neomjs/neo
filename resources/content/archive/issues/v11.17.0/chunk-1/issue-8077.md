---
id: 8077
title: 'Enhance Store DX: Add initRecord() to return Model instance on add'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-12-10T10:34:45Z'
updatedAt: '2025-12-10T10:59:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8077'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-10T10:59:47Z'
---
# Enhance Store DX: Add initRecord() to return Model instance on add

Improve Developer Experience (DX) when working with `lazy records` in `Neo.data.Store`.

Currently, adding a new record requires two steps to get the `Model` instance:
1. `store.add(data)` (returns the plain data object).
2. `store.get(id)` (returns the `Model` instance).

**Proposal:**
Add a new method `initRecord(data)` to `Neo.data.Store` that combines these steps:
```javascript
initRecord(data) {
    // Implementation concept
    const items = this.add(data);
    const item  = Array.isArray(items) ? items[0] : items;
    return this.get(item[this.keyProperty]);
}
```

**Refactoring:**
Update `src/calendar/view/week/plugin/DragDrop.mjs`:
- Rename the local `record` variable to `data` (since it starts as a plain object).
- Use `const record = owner.eventStore.initRecord(data)` to create the event.


## Timeline

- 2025-12-10T10:34:47Z @tobiu added the `enhancement` label
- 2025-12-10T10:34:47Z @tobiu added the `developer-experience` label
- 2025-12-10T10:34:47Z @tobiu added the `ai` label
- 2025-12-10T10:35:54Z @tobiu assigned to @tobiu
- 2025-12-10T10:51:43Z @tobiu referenced in commit `835e54d` - "Enhance Store DX: Add initRecord() to return Model instance on add #8077"
### @tobiu - 2025-12-10T10:52:37Z

**Input from Neo.mjs Agent:**

> ◆ I have implemented the fix with a slight variation from the original proposal to improve code clarity and safety.
> 
> **Implementation Details:**
> 1.  **`Neo.data.Store`**: Added the `initRecord(data)` method.
>     *   It does **not** call `add()`. Instead, it assumes the data is already present in the store (as a plain object), looks up its key using `getKeyProperty()`, and returns the fully instantiated `Model` via `get()`.
>     *   This separates the concern of "adding data" from "initializing a record".
> 
> 2.  **`Neo.calendar.view.week.plugin.DragDrop`**:
>     *   In `onColumnDragStart`, I introduced a new variable `recordData` to hold the plain object returned by `owner.eventStore.add()`.
>     *   This prevents shadowing the method's `data` argument (which contains the drag event info).
>     *   I then call `record = owner.eventStore.initRecord(recordData)` to obtain the record instance required by `EventDragZone`.
> 
> **Code Changes:**
> `src/data/Store.mjs`:
> ```javascript
>     /**
>      * Adds a new item to the store and immediately returns its record instance.
>      * @param {Object} data The data object to add
>      * @returns {Neo.data.Model} The created record
>      */
>     initRecord(data) {
>         return this.get(data[this.getKeyProperty()])
>     }
> ```
> 
> `src/calendar/view/week/plugin/DragDrop.mjs`:
> ```javascript
>             // ...
>             recordData = owner.eventStore.add({
>                 // ...
>             })[0];
> 
>             record = owner.eventStore.initRecord(recordData);
>             // ...
> ```

- 2025-12-10T10:59:47Z @tobiu closed this issue

