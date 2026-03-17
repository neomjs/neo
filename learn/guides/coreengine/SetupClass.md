# Class Compilation (`Neo.setupClass`)

In native JavaScript, defining a class is a static, one-time operation. Once the `class {}` block is evaluated, its prototype is largely fixed.

Neo.mjs takes a different approach. It introduces a crucial **compilation step** that occurs *after* a class is defined but *before* it is ever instantiated. This step is managed by `Neo.setupClass()`.

Every class definition in the Neo.mjs ecosystem must end by passing the class through this function:

```javascript readonly
import Base from './Base.mjs';

class MyComponent extends Base {
    static config = {
        className: 'MyApp.MyComponent',
        mySetting_: true
    }
}

// The crucial compilation step
export default Neo.setupClass(MyComponent);
```

## What Does `setupClass` Do?

`Neo.setupClass` acts as a class factory and meta-compiler. It performs several critical operations that transform a standard JS class into a powerful, declarative Neo component.

### 1. Prototype Chain Walking & Config Merging

The most important job of `setupClass` is to build a unified configuration object. It does this by walking up the prototype chain (from the current class all the way up to `core.Base`), extracting the `static config` object from each level.

It then merges these configs downwards. This allows a subclass to easily override a specific property without needing to redefine the entire configuration block.

```mermaid
graph TD
    Base[Neo.core.Base<br/>static config = { id_: null }]
    Comp[Neo.component.Base<br/>static config = { width_: null }]
    MyComp[MyApp.MyComponent<br/>static config = { width_: 300 }]

    Base --> Comp
    Comp --> MyComp

    subgraph Neo.setupClass Compilation
        Merge[Merge Configs Downwards]
        Merge -.-> FinalConfig[Unified Config:<br/>{ id_: null, width_: 300 }]
    end

    MyComp ==> Merge
```

### 2. Generating the Reactive Config API

As `setupClass` merges the configs, it looks for any property name ending with a trailing underscore (e.g., `mySetting_`).

This trailing underscore is the declarative signal for the Neo Config System. When `setupClass` encounters one, it automatically generates a public getter and setter on the class prototype (removing the underscore).

It wires these generated getters and setters into the `core.Config` instance (which will be created during `construct()`), enabling the `beforeSet`, `beforeGet`, and `afterSet` hooks.

### 3. Applying Overwrites

Before finalizing the unified config, `setupClass` checks a global `Neo.overwrites` object.

This is a powerful theming and configuration mechanism. It allows you to globally modify the default `static config` of a class *without* modifying its source code or extending it.

```javascript readonly
// Example: Globally change the default width of all generic components
Neo.overwrites = {
    Neo: {
        component: {
            Base: {
                width_: 500
            }
        }
    }
};
```

When `Neo.setupClass(Neo.component.Base)` runs, it will see this overwrite and apply `width_: 500` to its static config prototype.

### 4. Mixin Resolution

Neo.mjs supports a robust Mixin system to share functionality across unrelated class hierarchies. JavaScript only supports single inheritance, but complex UI components often need to share horizontal features (like being "Observable" or "Resizable").

`setupClass` parses the `mixins` array defined in the static config. It extracts both the methods and the configurations from the mixin classes and copies them directly onto the target class's prototype and config object.

```mermaid
graph TD
    classDef target fill:#4CAF50,stroke:#333,stroke-width:2px;
    classDef mixin fill:#2196F3,stroke:#333,stroke-width:2px;
    classDef result fill:#FF9800,stroke:#333,stroke-width:2px;

    T[Target Class<br/>e.g., MyApp.MyComponent]:::target
    M1[Mixin A<br/>e.g., core.Observable]:::mixin
    M2[Mixin B<br/>e.g., util.Resizable]:::mixin

    subgraph Neo.setupClass Mixin Resolution
        direction LR
        CopyMethods[Copy Methods]
        MergeConfigs[Merge Configs]
    end

    T -.-> |mixins: ['Mixin A', 'Mixin B']| CopyMethods
    M1 ==> CopyMethods
    M2 ==> CopyMethods
    M1 ==> MergeConfigs
    M2 ==> MergeConfigs
    
    CopyMethods -.-> R
    MergeConfigs -.-> R

    R[Enhanced Target Class<br/>Prototype has Mixin methods<br/>Config has Mixin configs]:::result
```

*   **Method Copying:** Methods from the mixin are attached to the target class prototype. `setupClass` tracks where methods came from using an internal `_from` property to prevent collisions if multiple mixins define the same method.
*   **Config Merging:** If a mixin defines reactive configs (e.g., `isResizable_`), those are added to the target class's `static config` and processed, generating the appropriate getters and setters.

### 5. Namespace Registration

Finally, `setupClass` uses the `className` config to register the newly compiled class into the global `Neo` namespace (or your application's namespace).

For example, if `className: 'Neo.button.Base'`, it ensures `globalThis.Neo.button.Base` points to the compiled class. This allows the framework's internal systems (like the JSON-to-VDOM parser) to easily look up and instantiate classes by their string names or `ntype` shortcuts.

### 6. The "Gatekeeper" Pattern (Mixed Environments)

`setupClass` includes a critical check at the very beginning: if the class namespace already exists, it immediately returns the existing class instead of recompiling it.

This "first one wins" strategy is what allows Neo.mjs to safely mix environments. For example, a production application running minified code can dynamically load unbundled ESM modules (like the LivePreview editor). If the unbundled module tries to `import` a core class that the main app has already loaded, `setupClass` ensures the existing, minified version is used, preventing catastrophic collisions.