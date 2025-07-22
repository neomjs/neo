# Beyond Hooks: Why Neo.mjs Reimagined Functional Components

If you've worked with modern JavaScript frameworks, you're familiar with functional components and hooks. They were a massive leap forward, allowing us to co-locate state and logic. But as our applications have grown, we've discovered the sharp edges of this model: the complex dependency arrays, the foot-guns of stale closures, and the mental overhead of `useMemo` and `useCallback` to prevent performance issues.

But what if the functional component model you know is just a stepping stone? What if it could be more predictable, more performant, and free from these complexities by design? 

In Neo.mjs v10, functional components aren't just a new API. They are the ultimate expression of our new, hyper-efficient reactive core. We didn't build them to copy other frameworks; we built them because our architecture unlocked a better way to write UIs.

---

### The "Why": The Problem of Fragmented Logic

Let's be honest: even in a well-structured class-based component, UI logic can become scattered. Imagine a simple button whose appearance depends on multiple state properties. In a classic component, the logic might look like this:

```javascript
// A conceptual classic component
class MyButton extends Neo.component.Base {
    static config = {
        text_: 'Click Me',
        iconCls_: null,
        state_: 'idle' // idle, busy, success
    }

    afterSetText(value, oldValue) {
        this.updateVdom();
    }

    afterSetIconCls(value, oldValue) {
        this.updateVdom();
    }

    afterSetState(value, oldValue) {
        // Maybe we change the text and icon based on state?
        if (value === 'busy') {
            this.text = 'Working...';
            this.iconCls = 'fa fa-spinner fa-spin';
        } else {
            // ... reset to original values
        }
        this.updateVdom();
    }
}
```

The logic that determines the button's final appearance is spread across three different `afterSet` hooks. To understand the component, you have to piece together the logic from multiple places. This is the mess that makes complex UIs hard to reason about.

---

### The New Foundation: UI as a Function of State

The solution to this fragmentation is to have a single place where the UI is defined. In our main v10 article, we introduced our new `Effect` system. The core principle is simple: **the UI is a pure function of state. When state changes, the UI re-creates itself automatically.**

The `createVdom` method in a Neo.mjs functional component is, conceptually, one giant `Effect`. It automatically subscribes to every piece of reactive state it reads. This is the magic that eliminates the need for manual dependency tracking or `this.update()` calls.

### The "How": Building with the Grain of the Reactive Core

With this new foundation, the API for functional components becomes incredibly intuitive and powerful.

**`defineComponent` & `createVdom`: Your Single Source of Truth**

All the logic for your component's output now lives in one, easy-to-read function. There's no more hunting through different methods to understand how the UI will look.

```javascript
import {defineComponent, useConfig} from 'neo.mjs/functional';

export default defineComponent({
    createVdom(config) {
        const [state, setState] = useConfig('idle');

        let text = config.text;
        let iconCls = config.iconCls;

        if (state === 'busy') {
            text = 'Working...';
            iconCls = 'fa fa-spinner fa-spin';
        }

        return {
            tag: 'button',
            className: 'my-button',
            cn: [
                {tag: 'i', className: iconCls},
                {tag: 'span', text: text}
            ]
        }
    }
});
```

**`useConfig` and Named Configs: The Inputs to Your Function**

Your `createVdom` function is driven by two types of inputs:

1.  **`useConfig` (Internal State):** This is for state that is private to your component. Crucially, calling `setState('busy')` doesn't just change a value; it triggers the re-execution of the entire `createVdom` function, guaranteeing a consistent UI every time.
2.  **Named Configs (Public API):** These are the "props" or external inputs to your reactive function, defined in the `static config` block (e.g., `text_`). They are the declarative way to control your component from the outside.

Because the entire VDOM is recreated from scratch on every change, you can be confident that the UI is always a perfect reflection of the current state. The reactive core is so efficient that this "brute force" approach is faster than manually trying to optimize updates.

---

### The AI Connection: Predictability for Human and Machine

This architecture isn't just better for you; it's essential for an AI co-developer. Because `createVdom` is a pure function of its inputs (`config` and `useConfig`), an AI can reliably change the UI by simply changing the data. It doesn't need to understand a complex class lifecycle or a web of `afterSet` hooks. This makes AI-driven UI generation dramatically simpler and more robust.

---

### Conclusion: A More Evolved Functional Component

The functional component model in Neo.mjs v10 is not just another implementation of hooks. It is a fundamentally more robust and performant model for the future of UI development. By centralizing logic in a single reactive function, we eliminate an entire class of bugs, reduce cognitive overhead, and create an architecture that is ready for the AI era.

In our next deep dive, we'll explore the engine that powers all of this: the new Two-Tier Reactivity system.