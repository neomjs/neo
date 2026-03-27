# Class Compilation (`Neo.setupClass`)

To solve the `constructor` trap and enable declarative configurations, Neo.mjs must know exactly how a class is structured before it creates an instance. In native JavaScript, defining a class is a static, one-time operation—once the `class {}` block is evaluated, its prototype is largely fixed. 

Neo.mjs introduces a crucial **compilation step** that occurs *after* a class is defined but *before* it is ever instantiated. This step is the forge where standard JS classes are granted their engine superpowers, managed by `Neo.setupClass()`.

Every class definition in the Neo.mjs ecosystem must end by passing the class through this meta-compiler:

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

`Neo.setupClass` acts as a class factory. It performs several critical, heavy-lifting operations that transform a standard JS class into a powerful, declarative Neo component.

### 1. Prototype Chain Walking & Config Merging

The most important job of `setupClass` is to build a unified configuration blueprint. It does this by walking up the prototype chain (from the current class all the way up to `core.Base`), extracting the `static config` object from each level.

It then merges these configs downwards. This allows a subclass to easily override a specific default property without needing to redefine the entire configuration block from its parent.

```mermaid
graph TD
    Base["Neo.core.Base<br/>static config: id_"]
    Comp["Neo.component.Base<br/>static config: width_"]
    MyComp["MyApp.MyComponent<br/>static config: width: 300"]

    Base --> Comp
    Comp --> MyComp

    subgraph setupClass
        Merge["Merge Configs Downwards"]
    end
    
    MyComp -.-> Merge
    Merge -.-> FinalConfig["Unified Config:<br/>{ id_: null, width_: 300 }"]
```

> **Crucial Rule:** You define a config as reactive by adding a trailing underscore (e.g., `width_`) exactly **once** in the prototype chain. If you extend a class and want to change the default value of an already reactive config, you **must not** use the underscore (e.g., use `width: 300`). Using the underscore again will cause `Neo.setupClass` to throw an error, protecting you from breaking the inheritance chain.

### 2. Generating the Reactive Config API

As `setupClass` merges the configs, it actively hunts for any property name ending with a trailing underscore (e.g., `mySetting_`).

This trailing underscore is the declarative signal for the Neo Config System. When the compiler encounters one, it automatically generates a public getter and setter on the class prototype (stripping the underscore). 

It wires these generated getters and setters into the `core.Config` system, guaranteeing that whenever this property is accessed or changed at runtime, the engine's `beforeSet`, `beforeGet`, and `afterSet` lifecycle hooks will fire.

### 3. Applying Overwrites

Before finalizing the unified blueprint, `setupClass` checks a global `Neo.overwrites` object.

This is a profoundly powerful theming and configuration mechanism. It allows you to globally modify the default `static config` of a class *without* modifying its source code or extending it.

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

When `Neo.setupClass(Neo.component.Base)` runs, it intercepts this overwrite and surgically injects `width_: 500` directly into its static config prototype.

### 4. Mixin Resolution

Complex UI components often need to share horizontal features (like being "Observable" or "Resizable") that don't fit cleanly into a single vertical inheritance tree. Since JavaScript only supports single inheritance, Neo provides a robust Mixin system.

`setupClass` parses the `mixins` array defined in the static config. It extracts both the methods and the configurations from the mixin classes and copies them directly onto the target class's prototype and config object.

```mermaid
graph TD
    T["Target Class (MyApp.MyComponent)"]
    M1["Mixin A (core.Observable)"]
    M2["Mixin B (util.Resizable)"]

    subgraph setupClass
        direction LR
        CopyMethods["Copy Methods"]
        MergeConfigs["Merge Configs"]
    end

    T -.-> |"mixins: ['Mixin A', 'Mixin B']"| CopyMethods
    M1 ==> CopyMethods
    M2 ==> CopyMethods
    M1 ==> MergeConfigs
    M2 ==> MergeConfigs
    
    CopyMethods -.-> R["Enhanced Target Class<br/>(Prototype & Configs updated)"]
    MergeConfigs -.-> R
```

*   **Method Copying:** Methods from the mixin are attached to the target class prototype. `setupClass` tracks where methods came from using an internal `_from` property to cleanly prevent collisions if multiple mixins define the same method.
*   **Config Merging:** If a mixin defines reactive configs, those are seamlessly integrated into the target class's blueprint and processed to generate getters and setters.

### 5. Advanced Component Composition (`mergeFrom`)

When building complex container components, you often want to allow developers to easily configure deeply nested child items without forcing them to override the entire `items` array.

Neo.mjs provides the `[mergeFrom]` symbol to handle advanced component composition directly within the static config block. It allows you to dynamically inject the value of one config property into a specific node of an array or object during instantiation.

```javascript readonly
import {isDescriptor, mergeFrom} from '../../core/ConfigSymbols.mjs';

class PageContainer extends Container {
    static config = {
        // 1. Define a specific config for the content area
        contentConfig_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : {
                module: MyContentComponent
            }
        },

        // 2. Define the main items layout
        items: {
            [isDescriptor]: true,
            clone         : 'deep',
            value         : {
                content: {
                    // 3. Inject contentConfig here during instantiation!
                    [mergeFrom]: 'contentConfig',
                    reference  : 'content',
                    weight     : 10
                },
                toolbar: {
                    module: Toolbar,
                    weight: 20
                }
            }
        }
    }
}
```

When a user creates this container, they can simply pass `contentConfig: { style: { padding: '20px' } }`. During the `construct()` phase, `core.Base` sees the `[mergeFrom]` symbol and automatically deep-merges that custom config block exactly where the symbol is placed inside the `items` tree. This is incredibly powerful for creating highly customizable, deeply nested widgets.

### 6. The "Gatekeeper" Pattern (Mixed Environments)

`setupClass` includes a critical check at the very beginning: if the class namespace already exists, it immediately returns the existing class instead of recompiling it.

This "first one wins" strategy is the secret to Neo's ability to safely mix environments. For example, a production application running minified code can dynamically load unbundled ESM modules (like the LivePreview editor). If the unbundled module tries to `import` a core class that the main app has already loaded, the `setupClass` gatekeeper ensures the existing, minified version is used, preventing catastrophic namespace collisions.

By the end of the `setupClass` phase, the class is fully armed. It has a unified prototype, integrated mixins, and shiny new reactive getters and setters. But a reactive property is only as good as its runtime update mechanism. What happens when multiple properties depend on each other during a complex state update? The compiler's job is done; it's time for the runtime engine to take over.