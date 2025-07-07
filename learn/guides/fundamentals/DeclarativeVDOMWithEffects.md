### A New Approach: Declarative VDOM with Effects

Neo.mjs v10 introduces a powerful new declarative pattern for defining a component's internal Virtual DOM (VDOM), serving as an alternative to the traditional imperative hook-based system. This approach, which leverages the new `Neo.core.Effect` class, allows developers to define a component's entire VDOM structure in a single, reactive function, similar to the `render()` method in React.

This guide will walk you through the new pattern, compare it to the classic approach, and explain when to use each.

### The Classic Pattern: Imperative Hooks

Let's look at the traditional way a component like `Neo.button.Base` defines and updates its VDOM.

**1. Initial VDOM Structure:**
The base structure is defined in the `_vdom` config.

```javascript readonly
// Neo.button.Base
class Button extends Component {
    static config = {
        _vdom: {
            tag: 'button', type: 'button', cn: [
                {tag: 'span', cls: ['neo-button-glyph']},
                {tag: 'span', cls: ['neo-button-text']},
                // ... and so on
            ]
        }
    }
}
```

**2. Imperative Updates:**
To make the component reactive, developers must implement specific `afterSet` hooks for each config that affects the UI. The logic is imperative and fragmented.

```javascript readonly
// Neo.button.Base - internal framework code
afterSetIconCls(value, oldValue) {
    let {iconNode} = this;
    // Imperative: Manually add/remove classes
    NeoArray.remove(iconNode.cls, oldValue);
    NeoArray.add(iconNode.cls, value);
    this.update();
}

afterSetText(value, oldValue) {
    let {textNode} = this;
    // Imperative: Manually set properties
    textNode.removeDom = !value;
    textNode.text = value;
    this.update();
}

afterSetPressed(value, oldValue) {
    // Imperative: Manually toggle a class
    NeoArray.toggle(this.cls, 'pressed', value);
    this.update();
}
```

**Pros:**
*   **Performance:** Updates are surgical and extremely fast. Only the code for the changed property is executed.

**Cons:**
*   **High Cognitive Load:** To understand the component's full rendering logic, a developer must find and read multiple, separate methods.
*   **Error-Prone:** Forgetting to implement a hook for a new config is a common source of bugs.

### The New Pattern: Declarative VDOM with `Effect`

The new `EffectButton` PoC demonstrates a more modern, declarative approach.

**1. A Single, Reactive Render Function:**
Instead of fragmented hooks, the entire VDOM is generated within a `Neo.core.Effect`. This effect automatically tracks its dependencies (like `this.text` or `this.pressed`) and re-runs whenever they change.

```javascript readonly
// button.Effect - The "Template Method"
createVdomEffect() {
    return new Effect({fn: () => {
        // The effect's only job is to get the config and trigger an update.
        this._vdom = this.getVdomConfig();
        this.update();
    }});
}

// The main VDOM builder
getVdomConfig() {
    return {
        tag: this.pressed ? 'a' : 'button', // Declarative logic
        cls: this.getVdomCls(),
        cn: this.getVdomChildren()
        // ... and so on
    };
}
```

**2. Centralized Logic:**
All VDOM logic is co-located, making it easy to read and understand at a glance.

```javascript readonly
// button.Effect - Centralized class and child generation
getVdomCls() {
    let vdomCls = [...this.baseCls, ...this.cls];
    // Declarative: Describe what the classes should be based on state
    NeoArray.toggle(vdomCls, 'no-text', !this.text);
    NeoArray.toggle(vdomCls, 'pressed', this.pressed);
    vdomCls.push('icon-' + this.iconPosition);
    return vdomCls;
}

getVdomChildren() {
    return [
        // Declarative: Describe the children based on state
        {tag: 'span', cls: ['neo-button-glyph', ...this._iconCls || []], removeDom: !this.iconCls},
        {tag: 'span', cls: ['neo-button-text'], removeDom: !this.text, text: this.text},
        // ... and so on
    ];
}
```

### The Power of Inheritance

A key challenge with a single render function is extensibility. The new pattern solves this by using a "Template Method" design. The main effect calls smaller, overridable builder methods.

This allows a subclass like `tab.header.EffectButton` to easily extend the VDOM without duplicating code.

```javascript readonly
// tab.header.EffectButton
class EffectTabButton extends EffectButton {
    // Override to add the indicator child node
    getVdomChildren() {
        // Get the standard button children from the parent class
        let children = super.getVdomChildren();

        // Add the new indicator node
        children.push({
            cls: ['neo-tab-button-indicator'],
            removeDom: !this.useActiveTabIndicator
        });

        return children;
    }

    // Override to add accessibility attributes
    getVdomConfig() {
        let vdomConfig = super.getVdomConfig();
        vdomConfig.role = this.role;
        if (this.pressed) {
            vdomConfig['aria-selected'] = true;
        }
        return vdomConfig;
    }
}
```

### When to Use Each Pattern: A Hybrid Approach

Neo.mjs v10 does not force you to choose one pattern over the other. Instead, it empowers you to use the right tool for the job.

**Use the Declarative `Effect` Pattern when (Recommended Default):**
*   Building most of your application components.
*   You value developer experience, readability, and maintainability.
*   The component's VDOM structure can be expressed as a pure function of its state.

**Use the Imperative `afterSet` Pattern when:**
*   You are building a highly complex, performance-critical component (e.g., a virtualized data grid or a canvas-based chart).
*   You need to perform surgical, hand-tuned VDOM manipulations for maximum performance, bypassing a full recalculation.

### Conclusion

The new declarative VDOM pattern is a major leap forward for component development in Neo.mjs. It provides a more modern, readable, and robust way to build components, while the classic imperative pattern remains a powerful tool for fine-grained performance optimization. By understanding both, you can build sophisticated, high-performance applications with an exceptional developer experience.
