# Asymmetric VDOM Updates: A Technical Deep Dive

## TL;DR

Neo.mjs can update Parent and Child components **independently and in parallel**, or merge them into a single atomic transaction—whichever is most efficient.

This is a fundamental shift from traditional frameworks where Parent updates typically force Child re-renders. We designed for multi-threaded, worker-based rendering from day one.

**Key innovations:**
- **Scoped Updates**: Disjoint updates (Depth 1) run in parallel.
- **Teleportation**: Updates can "teleport" across the component tree, allowing deep descendants to update without parent involvement.
- **Recursive Merging**: Bundles child updates into parent messages (`dist <= updateDepth`).
- **Transaction Pattern**: Atomic multi-component updates via `setSilent`.

---

One of Neo.mjs's most powerful performance features is its ability to perform **Asymmetric VDOM Updates**.

**The Problem:** In many frameworks, updating a Parent component forces a re-evaluation of its entire subtree. Even with memoization, the main thread must traverse the tree to decide what to skip.
**The Solution:** Neo.mjs treats the component tree as a collection of disjoint sets. A Parent and a Child can update **independently and in parallel** because the VDOM engine runs off the main thread and understands "Scoped Updates".

This guide provides a technical deep dive into the VDOM engine's update logic, the mechanics of "Scoped Updates," the "Merging" optimization algorithm, and the "Transaction Pattern."

## The Problem: The Cost of "The Tree"

In traditional Virtual DOM frameworks (like React or Vue), an update often implies re-rendering a significant portion of the component tree. When a parent component updates, it typically re-renders its children. This is "Symmetric" - the render tree matches the component tree.

However, in a multi-threaded environment like Neo.mjs, sending large VDOM trees across the worker bridge is expensive. We want to send the *minimum amount of data possible*.

## The Solution: Scoped Updates (Depth 1)

By default, Neo.mjs uses **Scoped Updates**. When you change a reactive config on a component, the engine calculates the VDOM diff **only for that specific component**, ignoring its children.

### How it Works

Every component has an `updateDepth` config, which defaults to `1`.

*   **Depth 1**: Only the component's own VDOM nodes are traversed.
*   **Child Placeholders**: Any child components inside the VDOM are represented as lightweight placeholders: `{ componentId: 'child-1' }`.
*   **Disjoint Sets**: Because the Parent's update only sees placeholders, and the Child's update sees its own full VDOM, the two operations effectively touch **disjoint sets of DOM nodes**.

This allows a Parent and a Child to update **simultaneously and independently** without conflict.

```mermaid
sequenceDiagram
    participant P as Parent Component
    participant C as Child Component
    participant VW as VDom Worker
    participant MT as Main Thread

    Note over P, C: Independent Updates (Scoped)

    P->>VW: updateBatch([Parent Payload]) - { id: 'parent', cn: [{componentId: 'child'}] }
    C->>VW: updateBatch([Child Payload]) - { id: 'child', text: 'New Text' }

    par Parallel Processing
        VW->>MT: Deltas for Parent
        MT->>P: Reply after the DOM write
    and
        VW->>MT: Deltas for Child
        MT->>C: Reply after the DOM write
    end
```

## Merging: The Optimization (Teleportation)

While parallel updates are safe, sending two messages to the worker is less efficient than sending one. If we know that a Parent and a Child are both updating at the same time, we can **merge** the Child's update into the Parent's payload.

With the **Teleportation** architecture, merging does **not** mean expanding the Child inside the Parent's VDOM tree (which would require updating the Parent's structure). Instead, it means bundling the Child's disjoint update payload into the same `updateBatch` message as the Parent.

### The Logic

A child update can merge into any ancestor's update, regardless of distance, as long as that ancestor's update is still pending. The ancestor's update then collects every merged child and sends a batch of disjoint payloads. [VDOM Engine: App Worker](../vdomengine/AppWorker.md) describes the exact rules.

### The Benefit

1.  **Reduced Traffic**: One message to the VDOM worker instead of N.
2.  **Atomic Paint**: The browser paints the Parent and Child changes in the same frame, preventing visual "pop-in" or layout thrashing.
3.  **Recursive Merging**: A Grandchild can merge into a Grandparent even if the intermediate Parent is not updating.

```mermaid
sequenceDiagram
    participant P as Parent Component
    participant C as Child Component
    participant M as VDom Manager
    participant VW as VDom Worker
    participant MT as Main Thread

    Note over P, C: Merged Update (Teleportation Batch)

    P->>P: setSilent({style: ...})
    C->>C: setSilent({text: ...})

    P->>P: update()

    Note right of P: VDOM Traversal
    P->>C: check merged updates?
    C-->>P: Yes

    Note right of P: Collect Disjoint Payloads

    P->>VW: updateBatch({ updates: { parent: {...}, child: {...} } })

    VW->>MT: Aggregated Deltas + VNodes
    MT->>P: Same reply, after the DOM write
    P->>M: Update Complete
    M->>C: Trigger Child Callbacks
```

## The Transaction Pattern

To force multiple components to update together in a single atomic batch, use the **Transaction Pattern**. This involves setting configs silently (`setSilent`) and then triggering a single update on the highest-level component.

### Example: Updating a Toolbar

Imagine a Toolbar (Parent) with three Buttons (Children). You want to change the Toolbar's style and update the text of all three buttons simultaneously.

```javascript
// 1. Queue updates silently (no worker messages sent yet).
// The toolbar goes first: a silent change joins only an ancestor update that is already pending.
toolbar.setSilent({ cls: ['my-active-toolbar'] });

button1.setSilent({ text: 'Save' });
button2.setSilent({ text: 'Cancel' });
button3.setSilent({ iconCls: 'fa fa-trash' });

// 2. Trigger the transaction
// Each button's change joined the pending toolbar update,
// so this one update sends all four changes in one batch.
toolbar.update();
```

### What happens under the hood?

`toolbar.setSilent()` leaves the toolbar with a pending update and sends nothing. Each button's silent change then joins that pending update instead of starting its own. `toolbar.update()` collects the toolbar and the buttons, sends their payloads in one `updateBatch()` call, and one set of deltas comes back.

**Order matters.** A button changed before the toolbar keeps its change pending, and a toolbar update at the default depth does not carry it. [VDOM Engine: App Worker](../vdomengine/AppWorker.md) covers the rules.

## Recursive Merging (formerly Leapfrog)

One of the most advanced capabilities of the engine is **Recursive Merging**. This occurs when a deep descendant (Grandchild) needs to update, but its direct Parent does not. If the Grandparent is updating, the Grandchild can merge into the Grandparent's cycle.

In a traditional merge model, the Grandparent would have to "bridge" to the Grandchild by expanding the clean Parent.
With **Teleportation**, this is much simpler: The Grandchild simply adds its disjoint payload to the Grandparent's batch. The clean Parent is ignored entirely.

This solves the "Pruning Problem" without the O(N) overhead of bridging.

```mermaid
sequenceDiagram
    participant GP as Grandparent
    participant P as Parent (Clean)
    participant GC as Grandchild (Dirty)

    Note over GP, GC: Recursive Merging (Teleportation)

    GC->>P: Merge? (No, P not updating)
    GC->>GP: Merge? (Yes, GP updating)

    GC->>GP: Register Merge

    GP->>GP: Collect Payloads

    GP->>GP: Result: { updates: { gp: {...}, gc: {...} } }
    Note right of GP: P is skipped entirely
```

## The Promise Lifecycle

`promiseUpdate()` **settles with the update that carries the component's change**, even when the component never sends an update message of its own. When `child` merges into `parent`, the `VDomUpdate` manager records the merge, and the parent's update settles the child's promise when it lands: it resolves after the DOM write, and rejects if that update fails.

This keeps your code flow the same whether the update was standalone or merged.

```javascript
// This settles even if 'child' never sends a message of its own
await child.promiseUpdate();
console.log('Update done (possibly merged)');
```

[VDOM Engine: App Worker](../vdomengine/AppWorker.md) covers the exact contract.

## Neo.mjs vs React: VDOM Update Strategies

| Scenario | React | Neo.mjs |
| :--- | :--- | :--- |
| **Parent style change, Child unchanged** | Re-renders Child by default (unless memoized). | Updates **only** Parent (Scoped Update). Child is a placeholder. |
| **Parent + Child both changing** | Single render pass. Large payload. | Can **Merge** (atomic) OR **Parallelize** (disjoint). |
| **Grandchild dirty, Parent clean** | Walks entire tree to find dirty node. | **Teleportation** (Grandchild updates in batch, skipping Parent). |
| **50 components updating** | 50 re-renders (unless batched). | **1 Transaction** (atomic paint via `setSilent`). |
| **Multi-threaded environment** | Not designed for this. | Optimized for **Worker Bridge** traffic. |

## When Does This Matter?

### For Traditional Apps
In typical single-page apps, these optimizations are nice-to-haves. React's main-thread scheduling is generally fast enough for standard forms and lists.

### For AI-Driven & Multi-Window Apps
This architecture becomes critical in two scenarios:

1.  **Conversational UIs (AI Agents)**:
    When an AI agent (like Gemini) decides to "update the chart, reset the filters, and change the grid selection" all at once, it triggers multiple state changes across the app.
    *   **React**: Might trigger cascading re-renders and main-thread blocking.
    *   **Neo.mjs**: Can batch these into a single worker message using the **Transaction Pattern**, ensuring the UI updates atomically without flicker.

2.  **Multi-Window Applications**:
    Neo.mjs runs the entire application in a SharedWorker (App Worker). This means one App Worker controls multiple browser windows.
    *   **Disjoint Updates**: A chart updating in Window A should not block a form typing in Window B. Scoped Updates ensure these are processed as independent streams.

## Architecture Constraints & Race Conditions

The engine guards disjoint updates for you. It takes the payload snapshot after a task yield, so a change and a `remove()` in the same tick land in one update. It keeps every batch inside one window, so deltas meant for a popup never reach another window. And its in-flight registry releases every former ancestor, even when a component moves while its update is in the air. [VDOM Engine: App Worker](../vdomengine/AppWorker.md) shows where each guarantee lives, and what a change to the engine must preserve.

## Best Practices

### When to use Independent Updates (Default)
*   **Unrelated Interactions**: A user hovering a button while a chart updates in the background.
*   **Performance Isolation**: When one component is very heavy (e.g., a Data Grid) and you don't want to block the UI of lighter components.

### When to use Merged Updates (Transactions)
*   **Visual Consistency**: When a UI state change affects multiple components that visually belong together (e.g., changing a Theme, disabling a Form).
*   **Layout Stability**: When changing a parent's layout (e.g., `vbox` to `hbox`) while simultaneously changing children's `flex` configs. Doing this separately could cause a frame of broken layout.
*   **Mass Updates**: Loading a complex view where 50+ components are created/updated at once.

## Summary

| Feature | Default | Purpose | Logic |
| :--- | :--- | :--- | :--- |
| **Scoped Update** | `updateDepth: 1` | Performance, Parallelism | Update only self, use placeholders for children. |
| **Teleportation** | Automatic | Optimization, Atomicity | Bundle child updates into parent batch (`updateBatch`). |
| **Transaction** | `setSilent` | Coordinated State Changes | Manually queue updates, flush with `parent.update()`. |