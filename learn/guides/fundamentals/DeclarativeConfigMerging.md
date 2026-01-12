# Declarative Config Merging & Structural Injection

One of the most powerful aspects of Neo.mjs is its class-based configuration system. However, as applications grow, you often face the challenge of **"Configuration Drilling"**—configuring a deeply nested component from a parent container without tightly coupling every intermediate layer.

Previously, this often required imperative logic in `construct()` or `afterSetItems` to manually hunt down components and apply settings.

Neo.mjs introduces **Declarative Config Merging** via the `mergeFrom` symbol, enabling a pattern we call **Structural Injection**. This allows you to separate the *definition* of your component hierarchy (structure) from its *configuration* (data/behavior), and merge them declaratively.

## The Problem: Rigid Hierarchies

Imagine a `MainContainer` that contains a `Sidebar`, which contains a `TreeList`.

```javascript
class MainContainer extends Container {
    static config = {
        items: [{
            module: Sidebar, // Nested container
            items : [{
                module: TreeList // Deeply nested component
                // How do we configure this TreeList from MainContainer subclasses?
            }]
        }]
    }
}
```

If a subclass `TicketsContainer` wants to change the `TreeList`'s `displayField`, it traditionally had to:
1.  Overwrite the entire `items` array (brittle, duplicates code).
2.  Use imperative logic to find the tree and set the config.

## The Solution: `mergeFrom`

The `mergeFrom` symbol allows an item in the `items` structure to declare, "I get my configuration from this property on the container."

### Step 1: Define the Configuration Object

Define a reactive config property to hold the settings. Use `merge: 'deep'` to allow subclasses to override specific properties easily.

```javascript
import {isDescriptor} from '../../src/core/ConfigSymbols.mjs';

class MainContainer extends Container {
    static config = {
        /**
         * Configuration for the nested TreeList.
         * Subclasses can override this to change tree behavior.
         */
        treeConfig_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : {
                displayField: 'text', // Default
                navigable   : true
            }
        }
    }
}
```

### Step 2: Bind the Item to the Config

Import `mergeFrom` and use it in your `items` definition.

```javascript
import {isDescriptor, mergeFrom} from '../../src/core/ConfigSymbols.mjs';

class MainContainer extends Container {
    static config = {
        // ... treeConfig_ defined above ...

        items: {
            [isDescriptor]: true,
            merge         : 'deep',
            clone         : 'deep', // Important! See "Prototype Pollution" below.
            value         : {
                sidebar: {
                    module: Sidebar,
                    items : {
                        myTree: {
                            module     : TreeList,
                            [mergeFrom]: 'treeConfig' // <--- The Magic
                        }
                    }
                }
            }
        }
    }
}
```

When `MainContainer` creates its items:
1.  It encounters the `myTree` item definition.
2.  It sees `[mergeFrom]: 'treeConfig'`.
3.  It looks up `this.treeConfig` on the `MainContainer` instance.
4.  It **deeply merges** `this.treeConfig` into the item definition.
5.  It instantiates the `TreeList` with the merged result.

### Step 3: Subclassing made Easy

Now, creating a specialized version of the container is trivial. You simply override the config object. The structure remains untouched.

```javascript
class TicketsContainer extends MainContainer {
    static config = {
        // Override just the specific settings we care about
        treeConfig: {
            displayField: 'ticketTitle',
            rootPath    : '/tickets'
        }
    }
}
```

The `TicketsContainer` will render the exact same structure as `MainContainer`, but the deep-nested `TreeList` will receive the new `displayField` and `rootPath`.

## The Structural Injection Pattern

This pattern encourages a clear separation of concerns:

1.  **Structure (`items_`):** Defines the skeleton of your UI (layout, component hierarchy, references). This rarely changes between subclasses.
2.  **Configuration (`myConfig_`):** Defines the variable aspects of the UI (text, stores, flags, behavior). This is what subclasses customize.

By injecting configuration into structure using `mergeFrom`, you create highly reusable, "White-Box" containers that are easy to extend and maintain.

## Recursive Support

The `mergeFrom` feature is **recursive**. It works for:
- Direct children.
- Nested children defined via `items` arrays.
- Nested children defined via `items` configuration objects (maps).

This means you can inject configuration into a component nested 10 levels deep, as long as the hierarchy is defined within the same container class.

## Advanced: Overriding Config Descriptors

You might notice that we are redefining `items` in the example above, even though `Neo.container.Base` already defines it.

Neo.mjs supports **Descriptor Merging** in `static config`. If a parent class defines a reactive config (like `items_`), a subclass can override its behavior by providing a new descriptor.

```javascript
        items: {
            [isDescriptor]: true,
            merge         : 'deep', // Overrides/Adds merge strategy
            clone         : 'deep', // Overrides inherited clone strategy
            value         : { ... }
        }
```

The engine merges the subclass descriptor *on top* of the parent's descriptor. This allows you to refine behaviors (like changing `clone: 'shallow'` to `clone: 'deep'`) while keeping the property reactive.

## Prototype Pollution & `clone: 'deep'`

When defining complex nested structures in `static config`, you must be careful about shared object references.

By default, `Neo.mjs` config objects are shared across all instances of a class. If the framework modifies these objects (e.g., merging configs), it can affect other instances (Prototype Pollution).

To prevent this, **always** use `clone: 'deep'` when using the Structural Injection Pattern with object-based items.

```javascript
        items: {
            [isDescriptor]: true,
            merge         : 'deep',
            clone         : 'deep', // <--- CRITICAL
            value         : {
                // ... your nested structure ...
            }
        }
```

This ensures that every instance of your container gets its own fresh copy of the item definitions, safe for modification and merging.

## Summary

| Feature | Description |
| :--- | :--- |
| **`mergeFrom`** | A symbol used in item definitions to reference a config property on the parent container. |
| **Injection** | The parent config is deeply merged *on top* of the item's definition. |
| **Recursion** | Works for deeply nested items defined within the container's config. |
| **Overriding** | Subclasses override the *config property*, not the `items` structure. |
| **Safety** | Use `clone: 'deep'` on the `items` descriptor to prevent cross-instance state pollution. |
