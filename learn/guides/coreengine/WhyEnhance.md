# Why Enhance JS Classes? (`construct` vs `constructor`)

When building a high-performance, multi-threaded application platform like Neo.mjs, the vanilla JavaScript `class` system quickly hits an architectural wall. While ES6 classes are a vast improvement over raw prototype manipulation, they lack the built-in mechanisms required for a declarative UI engine: automated reactivity, a unified initialization lifecycle, and robust configuration merging.

The most significant limitation arises from the native initialization sequence itself—specifically, how JavaScript handles class fields and the `super()` call within the `constructor`.

## The `constructor` Trap in Native JS

In native JavaScript, class fields (properties defined directly on the class body) are initialized *after* the `super()` call to the parent constructor finishes. 

This creates a fundamental "chicken and egg" problem when you want a generic base class to automatically handle configurations provided by its specialized subclasses. 

Consider this standard JS example:

```javascript readonly
class BaseComponent {
    constructor(config = {}) {
        // Attempting to merge provided config with class defaults.
        // The problem: SubComponent hasn't initialized `this.defaultColor` yet!
        this.color = config.color || this.defaultColor;
        
        console.log('Base constructor called. Color is:', this.color);
    }
}

class SubComponent extends BaseComponent {
    // Class field defined here
    defaultColor = 'blue';

    constructor(config) {
        // We MUST call super() before accessing `this`
        super(config);
        console.log('Sub constructor called. Default color is:', this.defaultColor);
    }
}

const myComp = new SubComponent({ text: 'Hello' });
// Output:
// Base constructor called. Color is: undefined
// Sub constructor called. Default color is: blue
```

Because `super()` must be called before `this` can be used, the `BaseComponent` constructor executes *before* `SubComponent` attaches `defaultColor` to the instance. The base class is blind to its subclass's fields during its own construction phase.

This makes it impossible to build a sophisticated `Base` class that can automatically read, merge, and apply declarative configurations from its descendants during the native instantiation phase.

## The Neo Solution: `Neo.create()` and `construct()`

Neo.mjs elegantly bypasses this limitation by decoupling the *native instantiation* from the *logical configuration*.

Instead of using the `new` keyword and the native `constructor`, you instantiate Neo classes using `Neo.create()`. The Neo core architecture dictates that you **should almost never write a native `constructor()` in your Neo classes**. Instead, the engine relies on a lifecycle method named `construct(config)`.

Here is how `Neo.create()` orchestrates the birth of an object:

1. **Native Instantiation:** `Neo.create()` calls `new cls()`. Because no custom `constructor` is defined, the native JS engine executes the default constructor, running through the entire inheritance chain. This ensures that **all class fields from all subclasses are fully initialized and attached to the instance**.
2. **Logical Construction:** *After* the native object is fully formed and hydrated with all its fields, `Neo.create()` manually invokes the `construct(config)` method on the instance, passing in the user's configuration object.

Let's look at how Neo's `core.Base.mjs` handles this logical construction:

```javascript readonly
// Simplified representation of Neo.core.Base construct logic
construct(config={}) {
    let me = this;

    // ... ID generation and other setup ...

    // 1. Assign class fields first
    config = me.setFields(config);

    // 2. Initialize the reactive config system
    me.initConfig(config);

    // 3. Triggers async logic (like remote method registration)
    Promise.resolve().then(async () => {
        await me.initAsync();
        me.isReady = true;
    });
}
```

### The Benefits of `construct()`

By the time `construct()` runs inside `Neo.core.Base`, the instance `this` is completely hydrated. Every class field and prototype method defined anywhere in the inheritance chain is ready and accessible.

This late-stage logical construction enables the foundational features of the engine:

* **Declarative Config Merging:** The base class can now safely read static configurations, prototype values, and class fields from its subclasses, allowing it to perform deep, intelligent merging of complex configuration objects (like layouts or component items).
* **The Config System:** It provides the precise entry point to initialize the `core.Config` system, setting up the reactive state of the component.
* **Unified Lifecycle:** It establishes a predictable, multi-stage initialization process (`construct` -> `onConstructed` -> `init` -> `initAsync`) that handles both synchronous setup and asynchronous dependencies.

By abandoning the rigid native `constructor` in favor of the managed `construct()` lifecycle, the Neo core transforms standard JavaScript objects into intelligent instances ready to be configured. But an instance cannot be configured if the class itself doesn't know what its configs are supposed to do. For that, we must look at what happens before the object is even born.