# Why Enhance JS Classes? (`construct` vs `constructor`)

When building a high-performance web platform like Neo.mjs, the vanilla JavaScript `class` system presents several architectural limitations. While ES6 classes are a vast improvement over prototype manipulation, they lack built-in mechanisms for declarative configuration, automated reactivity, and a unified initialization lifecycle.

The most significant limitation arises from how JavaScript handles class fields and the `super()` call within the `constructor`.

## The `constructor` Trap in Native JS

In native JavaScript, class fields (properties defined directly on the class body) are initialized *after* the `super()` call to the parent constructor finishes.

This creates a fundamental "chicken and egg" problem when you want a base class to automatically handle configurations provided by its subclasses.

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

Because `super()` must be called before `this` can be used, the `BaseComponent` constructor executes *before* `SubComponent` attaches `defaultColor` to the instance. The base class cannot read subclass fields during its own construction phase.

This makes it impossible to build a generic `Base` class that automatically reads, merges, and applies declarative configurations from its descendants during the native instantiation phase.

## The Neo Solution: `Neo.create()` and `construct()`

Neo.mjs elegantly bypasses this limitation by decoupling the *native instantiation* from the *logical configuration*.

Instead of using the `new` keyword and the native `constructor`, you instantiate Neo classes using `Neo.create()`.

The Neo core architecture dictates that you **should almost never write a native `constructor()` in your Neo classes**. Instead, the framework relies on a lifecycle method named `construct(config)`.

Here is how `Neo.create()` orchestrates the instantiation:

1. **Native Instantiation:** `Neo.create()` calls `new cls()`. Because no custom `constructor` is defined, the native JS engine executes the default constructor, running through the entire inheritance chain. This ensures that **all class fields from all subclasses are fully initialized and attached to the instance**.
2. **Logical Construction:** *After* the native object is fully formed, `Neo.create()` manually invokes the `construct(config)` method on the instance, passing in the user's configuration object.

Let's look at how Neo's `core.Base.mjs` handles this:

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

By the time `construct()` runs inside `Neo.core.Base`, the instance `this` is completely hydrated with every class field and prototype method defined anywhere in the inheritance chain.

This enables several critical framework features:

* **Declarative Config Merging:** The base class can safely read static configurations, prototype values, and class fields from its subclasses, allowing it to perform deep, intelligent merging of complex configuration objects (like layouts or component items).
* **The Config System:** It provides the entry point to initialize the `core.Config` system, which sets up the reactive getters, setters, and `beforeSet`/`afterSet` hooks for the instance.
* **Unified Lifecycle:** It establishes a predictable, multi-stage initialization process (`construct` -> `onConstructed` -> `init` -> `initAsync`) that handles both synchronous setup and asynchronous dependencies (like loading workers or fetching data) before marking the component as "ready".

By replacing the rigid native `constructor` with the managed `construct()` lifecycle, the Neo core transforms standard JavaScript objects into powerful, declarative, and reactive instances.
