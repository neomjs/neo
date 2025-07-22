# Neo.mjs v10: The Reactive, Multi-Threaded Framework You've Been Waiting For

Is your main thread holding your application hostage? It’s a story every web developer knows: as your application grows in complexity, the UI starts to stutter, animations lag, and the user experience suffers. What if you could build complex, data-heavy UIs that run silky-smooth by default, because the framework was designed from the ground up to move the hard work off the main thread?

Welcome to Neo.mjs v10. 

This isn't just an update; it's a revolution in how web applications are built. We've re-architected our core to deliver a state-of-the-art developer experience, combining a powerful new reactivity model, a modern functional UI layer, and a hyper-optimized rendering engine. Let's dive in.

---

### A Modern, Functional UI Layer You'll Love

We believe that modern development should be intuitive. That's why we've introduced a new, hook-based functional UI layer that will feel right at home for developers coming from React, Vue, or Solid.js. With `defineComponent`, you can create components as pure functions, and with `useConfig`, you can manage internal state with ease.

Here's how simple it is to create a component:

```javascript readonly
import {defineComponent, useConfig} from 'neo.mjs/functional';

export default defineComponent({
    createVdom() {
        const [name, setName] = useConfig('World');

        useEvent('click', () => setName(prev => prev === 'Neo' ? 'World' : 'Neo'));

        return {
            text: `Hello, ${name}!`
        }
    }
});
```

But this is just the beginning. This familiar, elegant API is supercharged by Neo.mjs's unique multi-threaded architecture, giving you a level of performance that other frameworks can't match.

---

### Effortless State Management with "Two-Tier Reactivity"

Neo.mjs v10 introduces a revolutionary "Two-Tier" reactivity system, giving you the perfect tool for every state management challenge.

**Tier 1: The Classic Hook-Based System**
Our battle-tested, imperative system gives you fine-grained control. When a config changes, an `afterSet` hook is called, allowing you to define exactly what happens next. Think of it as a manual phone tree: you have a list of contacts, and you call each one to deliver the news.

**Tier 2: The Modern Effect-Based System**
This is where the magic happens. Our new declarative system is like a subscription service. You write code that *uses* a value, and the framework automatically knows that this code now depends on that value. When the value changes, your code re-runs automatically. No more manual dependency management. It just works.

These two tiers coexist in perfect harmony. You can use the simplicity of direct property access, the power of declarative effects, and the explicit control of imperative hooks, all at the same time.

---

### The Performance Powerhouse: Asymmetric VDOM Updates

We've moved beyond the traditional Virtual DOM. Our new VDOM engine performs **asymmetric updates**. When a parent and a deeply nested child change at the same time, we don't re-render the whole tree. We create a single, surgical payload with only the changes, telling the renderer to ignore everything else.

Imagine you're renovating a skyscraper. Instead of sending the construction crew a new blueprint for the entire building, you send them a blueprint for just the one room that changed. The result is hyper-efficient updates and unparalleled performance.

---

### Secure by Design

In today's web, security can't be an afterthought. Neo.mjs helps you build safer apps by default. By automatically handling output as plain text and avoiding `innerHTML`, we protect you from common Cross-Site Scripting (XSS) vulnerabilities by design.

---

### The Bigger Picture

All of this is made possible by a suite of architectural innovations, including an intelligent state provider model that makes managing complex data hierarchies feel intuitive. We'll explore all these topics in our deep-dive series.

---

### Ready to Get Started?

Ready to experience the future of web development? Explore our new functional component examples, and when you're ready to see how it all works, dive into our technical articles.

*   [Explore Functional Component Examples](https://neomjs.com/dist/production/apps/portal/index.html#mainview=examples,vdom=true,example=functionaldefinecomponent)
*   [Read the Deep-Dive Articles](./learn/blog)
