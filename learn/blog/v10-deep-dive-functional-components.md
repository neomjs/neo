# Designing Functional Components for a Multi-Threaded World

## Say Goodbye to Manual Memoization: How a New Architecture Makes Performance a Feature, Not a Chore.

Functional components have become a standard for building UIs, but they often come with a hidden cost: a constant, manual
effort to manage performance. We've learned to fight unnecessary re-renders with memoization hooks and complex dependency
arrays. But what if these weren't fundamental trade-offs? What if they were symptoms of an architecture that binds our UI
logic to a single thread?

This is an exploration into a different kind of functional component—one designed from the ground up for a multi-threaded
world, where performance is a feature of the architecture, not a burden on the developer.

*(Part 3 of 5 in the v10 blog series. Details at the bottom.)*

### A First Look: The Anatomy of a Multi-Threaded Functional Component

Before we dive into the "why," let's look at the "what." Here is a simple, complete, and reactive functional component in
Neo.mjs. Keep this structure in mind as we explore how it solves common performance problems at an architectural level.

```javascript
import {defineComponent, useConfig, useEvent} from 'neo.mjs';

export default defineComponent({
    // The component's public API
    config: {
        className: 'My.Counter',
        labelText_: 'Counter:'
    },

    // The function that creates the VDOM
    createVdom(config) {
        // Internal, private state
        const [count, setCount] = useConfig(0);

        // An event listener that updates the private state
        useEvent('click', () => setCount(prev => prev + 1));

        return {
            tag: 'button',
            cn: [
                {tag: 'span', text: config.labelText},
                {tag: 'span', cls: ['count-badge'], text: count}
            ]
        }
    }
});
```

Notice what's missing: there are no dependency arrays and no manual memoization wrappers. Now, let's explore the
architecture that makes this clean, simple code possible.

---

### The Architectural Divide: Why Your Component's Environment Matters

The key to this new model is a fundamental shift in where your code runs. In a traditional single-threaded framework,
your component logic, state management, VDOM diffing, and DOM manipulation all compete for resources on the
**same main thread** that handles user interactions.

In Neo.mjs, the architecture is fundamentally different:

1.  **Your Application Logic (including your component's `createVdom` function) runs in a dedicated App Worker.**
2.  **The VDOM diffing happens in a separate VDom Worker.**
3.  **The Main Thread is left with one primary job: applying the calculated DOM patches.**
    While this process leverages browser primitives like `requestAnimationFrame` for optimal visual synchronization,
    it's crucial to understand that *only* the final, highly optimized DOM updates occur here. Your application logic
    and VDOM calculations are entirely offloaded to workers, preventing main thread contention and ensuring a consistently
    smooth user experience.

This isn't just a minor difference; it's a paradigm shift. Your component code is decoupled from the rendering engine,
which allows for a level of performance and predictability that is architecturally impossible on the main thread.
With this in mind, let's see how this new architecture solves old problems.

---

### Solving Core Performance Challenges Architecturally

Let's tackle the performance compromises you've learned to live with, one by one, and show how a multi-threaded
architecture solves them at their root.

#### 1. The Challenge: Cascading Updates

In many component-based systems, a state change in a parent component triggers a re-render. By default, this often
re-renders **all of its children**, whether their own inputs have changed or not. To prevent this performance drain,
developers are forced into manual optimization. This often involves wrapping components in memoization functions and
carefully managing the referential stability of callbacks and object props. This manual work becomes a core, and often
frustrating, part of the development process.

**The Neo.mjs Solution: Surgical Effects, Not Brute-Force Renders**

Our `createVdom` method is a surgical `Effect`. It automatically and precisely tracks every piece of reactive state it reads.
When a piece of state changes, **only the specific `createVdom` effects that depend on that exact piece of state are
queued for re-execution.**

There are no cascading re-renders. If a parent's `createVdom` re-runs, but the configs passed to a child have not changed,
the child component's `createVdom` function is **never executed**.

This efficiency extends to child components. On the first execution cycle, when a child component is encountered in the VDOM,
Neo.mjs creates a new instance of that child component. In all subsequent renders, if the child component is still present,
Neo.mjs *retains* the existing instance. Instead of re-executing the child's `createVdom` or re-creating its entire VDOM,
Neo.mjs employs a sophisticated `diffAndSet()` mechanism. This process surgically compares the new configuration (props)
intended for the child with its last applied configuration. Only if actual changes are detected are the corresponding
`set()` methods invoked on the child component's instance. This triggers a highly localized, scoped VDOM update within
that child, ensuring that only the truly affected parts of the UI are re-rendered, even for deeply nested components.

To prove this, consider this example:
```javascript
import {defineComponent, useConfig} from 'neo.mjs/src/functional/_export.mjs';

const ChildComponent = defineComponent({
    createVdom(config) {
        // This log is our proof. It will only fire when this
        // specific component's render logic is executed.
        console.log('Rendering ChildComponent');
        return {tag: 'div', text: 'I am the child'};
    }
});

export default defineComponent({
    createVdom() {
        const [count, setCount] = useConfig(0);

        return {
            cn: [{
                tag: 'button',
                onclick: () => setCount(prev => prev + 1),
                text: `Parent Clicks: ${count}`
            }, {
                // The child component receives no props that change
                // when the parent's internal 'count' state changes.
                module: ChildComponent
            }]
        }
    }
});
```
> When you run this code and click the button, you will see the "Parent Clicks" count update in the UI, but the
> "Rendering ChildComponent" message will only appear in the console **once**. This demonstrates that the parent's state
> change did not trigger a re-render of the child, proving the efficiency of the architecture.

#### 2. The Challenge: The Boilerplate of Immutability

To signal that a state change has occurred, many frameworks require developers to treat state as immutable. To change a
nested object, you have to meticulously reconstruct the object path, creating new references for every level. While this
makes the change detection algorithm simpler for the framework, it offloads significant cognitive burden onto the developer.

```javascript
// The familiar immutable update dance
setState(prevState => ({
  ...prevState,
  deeply: {
    ...prevState.deeply,
    nested: {
      ...prevState.deeply.nested,
      property: 'new value'
    }
  }
}));
```

**The Neo.mjs Solution:** Mutability for You, Immutability for the Machine

We believe the developer should not carry this cognitive load. In Neo.mjs, you can just mutate the state directly.
It's simple and intuitive.

```javascript
// Just change the value. That's it.
this.myObject.deeply.nested.property = 'new value';
```

How does it work? When an update is triggered, the framework handles creating an immutable JSON snapshot of the VDOM for
the diffing process in the VDom Worker. We provide the best of both worlds: simple, direct mutation for the developer
and a safe, immutable structure for the high-performance diffing algorithm.

#### 3. The Challenge: The "Hydration is the Only Way" Mindset

The industry has invested heavily in Server-Side Rendering and hydration to improve perceived performance and SEO.
For content-heavy sites, this is a valid strategy. But for complex, stateful Single-Page Applications, it introduces
immense complexity: the "hydration crisis," the difficulty of managing server vs. client components, and the fact that
after all that work, your application is *still* running on the client's main thread.

**The Neo.mjs Solution: Blueprints, Not Dehydrated HTML**

We offer a more robust and scalable model for SPAs. Instead of sending pre-rendered HTML that needs to be brought back
to life, we can send a compact **JSON blueprint**. The client-side engine, running in a worker, constructs the live,
interactive UI from this blueprint. This is a more efficient, more predictable, and architecturally cleaner way to build
complex applications that are not primarily focused on static content.

---

### Building a Real Application

The simple counter example is a great start, but the true power of functional components is revealed when you build a
complete, interactive application. Let's build a slightly more advanced "Task List" application to demonstrate how all
the pieces come together.

This example will showcase:
- **Full Interoperability:** Neo.mjs embraces both functional and class-based (OOP) component paradigms as first-class
  citizens, offering unparalleled flexibility. For developers familiar with the functional style, our functional
  components provide a natural and intuitive starting point within Neo.mjs, allowing them to leverage a familiar approach.
  Regardless of your preferred paradigm, you can seamlessly integrate functional components into traditional OOP containers,
  and conversely, directly embed class-based components within the declarative VDOM of a functional component.
  This architectural strength empowers developers to choose the most appropriate style for each part of their application,
  or combine them as needed, without compromise.
- **Component Composition:** Using a class-based `List` component within our functional view.
- **State Management:** Tracking the currently selected task.
- **Conditional Rendering:** Displaying task details only when a task is selected.
- **Event Handling:** Updating state based on events from a child component.

Here is the complete, interactive example.

```javascript live-preview
import {defineComponent, useConfig} from 'neo.mjs';
import List from 'neo.mjs/src/list/Base.mjs';
import Store from 'neo.mjs/src/data/Store.mjs';

// 1. Define a simple data Store for our list
const TaskStore = Neo.create(Store, {
    data: [
        {id: 1, title: 'Build a better component model', description: 'Re-imagine what a component can be when freed from the main thread.'},
        {id: 2, title: 'Create a new reactivity system', description: 'Design a two-tier system that is both powerful and intuitive.'},
        {id: 3, title: 'Revolutionize the VDOM',         description: 'Build an asymmetric, off-thread VDOM engine for maximum performance.'}
    ]
});

// 2. Define our main application view
export default defineComponent({
    config: {
        className: 'My.TaskListApp'
    },
    createVdom() {
        // 3. Manage the selected task with useConfig
        const [selectedTask, setSelectedTask] = useConfig(null);

        const onSelectionChange = ({value}) => {
            // 4. Update our state when the list selection changes
            setSelectedTask(TaskStore.get(value[0]));
        };

        const paneStyle = {
            border : '1px solid #c0c0c0',
            margin : '10px',
            padding: '10px'
        };

        return {
            cn: [{
                // 5. The List Component
                module   : List,
                store    : TaskStore,
                width    : 250,
                style    : paneStyle,
                listeners: {
                    selectionChange: onSelectionChange
                }
            }, {
                // 6. The Details Pane (with conditional rendering)
                flex: 1,
                style: paneStyle,
                cn: selectedTask ? [
                    {tag: 'h2', text: selectedTask.title},
                    {tag: 'p',  text: selectedTask.description}
                ] : [{
                    tag  : 'div',
                    style: {color: '#888'},
                    text : 'Please select a task to see the details.'
                }]
            }]
        }
    }
});
```

This single `defineComponent` call creates a fully-featured application. Notice how the `createVdom` function is a pure,
declarative representation of the UI. When the `selectedTask` state changes, the framework surgically re-renders only the
details pane. This is the power of the new component model in action: complex, stateful, and performant applications with
beautifully simple code.

---

### Conclusion: A Different Philosophy, A Better Component

Neo.mjs functional components are a re-imagining of what a functional component can be when freed from the architectural
constraints of the main thread. They offer a development experience that is not only more performant by default but also
simpler and more intuitive.

This is what it feels like to stop paying the performance tax and start building again.

The clean, hook-based API for functional components is possible because it stands on the shoulders of a robust, modular,
and deeply integrated class config system. To learn more about the powerful engine that makes this all possible, see our deep
dive on the **Two-Tier Reactivity System**.

Next, we will look at how this architecture revolutionizes the very way we render UIs with the Asymmetric VDOM and JSON Blueprints.

---

## The Neo.mjs v10 Blog Post Series

1. [A Frontend Love Story: Why the Strategies of Today Won't Build the Apps of Tomorrow](./v10-post1-love-story.md)
2. [Deep Dive: Named vs. Anonymous State - A New Era of Component Reactivity](./v10-deep-dive-reactivity.md)
3. Designing Functional Components for a Multi-Threaded World
4. [The VDOM Revolution: How We Render UIs from a Web Worker](./v10-deep-dive-vdom-revolution.md)
5. [Designing a State Manager for Performance: A Deep Dive into Hierarchical Reactivity](./v10-deep-dive-state-provider.md)
