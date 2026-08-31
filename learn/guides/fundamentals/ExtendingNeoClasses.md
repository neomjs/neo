# Extending Neo Classes

Neo.mjs is built upon a robust and consistent class system. Understanding how to extend core classes is fundamental
to building custom functionality, whether you're creating new UI components, defining data structures, or implementing
application logic.

This guide covers the universal principles of class extension in Neo.mjs, which apply across all class types, not just
UI components.

## 1. The `static config` Block: Defining Properties

Every Neo.mjs class utilizes a `static config` block. This is where you define the properties that instances of your
class will possess. These properties can be simple values, objects, or even other Neo.mjs class configurations.

```javascript readonly
class MyBaseClass extends Neo.core.Base {
    static config = {
        className: 'My.Base.Class', // Unique identifier for the class
        myString : 'Hello',
        myNumber : 123
    }
}

export default Neo.setupClass(MyBaseClass);
```

Common configs you'll encounter include `className` (a unique string identifier for your class) and `ntype` (a shorthand
alias for component creation).

## 2. Reactive Configs: The Trailing Underscore (`_`)

A cornerstone of Neo.mjs's reactivity is the trailing underscore (`_`) convention for configs defined in `static config`.
When you append an underscore to a config name (e.g., `myConfig_`), the engine automatically generates a reactive
getter and setter for it.

```javascript readonly
class MyReactiveClass extends Neo.core.Base {
    static config = {
        className        : 'My.Reactive.Class',
        myReactiveConfig_: 'initial value' // This config is reactive
    }

    onConstructed() {
        super.onConstructed();
        console.log(this.myReactiveConfig);  // Accesses the getter
        this.myReactiveConfig = 'new value'; // Triggers the setter
    }
}

export default Neo.setupClass(MyReactiveClass);
```

Assigning a new value to a reactive property (e.g., `this.myReactiveProp = 'new value'`) triggers its setter, which in
turn can invoke lifecycle hooks, enabling automatic updates and side effects. When you are declaring a **new** config,
leaving the underscore off makes it a plain prototype value that does not trigger this reactive behavior.

### Overriding an inherited reactive config

A config is declared reactive exactly once per prototype chain, so the sentence above inverts as soon as you are
*extending* rather than declaring. To give an inherited reactive config a new default, use the **bare name** — it stays
fully reactive, lifecycle hooks included:

```javascript readonly
class MyComponent extends Neo.component.Base {
    static config = {
        className: 'My.Component',
        width    : 300 // overrides the inherited `width_` default — still reactive
    }
}
```

Repeating the underscore is not merely unidiomatic — `Neo.setupClass` **throws**, because the parent class already owns
the accessor:

```javascript readonly
static config = {
    width_: 300 // ✗ throws: 'width' is already defined as reactive by a parent class
}
```

If what you need is custom behavior rather than a new default, implement the `beforeGetWidth()`, `beforeSetWidth()` or
`afterSetWidth()` hooks described in section 3 instead of redeclaring the config. The canonical statement of this rule
lives in [Class Compilation → Prototype Chain Walking & Config Merging](../coreengine/SetupClass.md#1-prototype-chain-walking--config-merging).

## 3. Configuration Lifecycle Hooks (`beforeSet`, `afterSet`, `beforeGet`)

For every reactive config (`myConfig_`), Neo.mjs provides three optional lifecycle hooks that you can implement in your
class. These methods are automatically called by the engine during the config's lifecycle, offering powerful
interception points:

*   **`beforeSetMyConfig(value, oldValue)`**:
    * **Purpose**: Intercepts the value *before* it is set. Ideal for validation, type coercion, or transforming the
      incoming value.
    * **Return Value**: Return the (potentially modified) `value` that should be set.
      Returning `undefined` or `null` will prevent the value from being set.

*   **`afterSetMyConfig(value, oldValue)`**:
    * **Purpose**: Executed *after* the value has been successfully set. Ideal for triggering side effects, updating
      the UI (e.g., calling `this.update()` for components), or firing events.
    * **Return Value**: None.

*   **`beforeGetMyConfig(value)`**:
    * **Purpose**: Intercepts the value *before* it is returned by the getter. Useful for lazy initialization,
      computing values on demand, or returning a transformed version of the stored value.
    * **Return Value**: Return the `value` that should be returned by the getter.



## 4. Flexible Configuration of Instances: The `beforeSetInstance` Pattern

Neo.mjs offers significant flexibility in how you configure properties that expect an instance of a Neo.mjs class
(e.g., `store`, `layout`, `controller`). This flexibility is powered by the `Neo.util.ClassSystem.beforeSetInstance`
utility, which intelligently converts various input types into the required instance.

This pattern is commonly used within `beforeSet` lifecycle hooks to ensure that by the time a config property is set,
it always holds a valid Neo.mjs instance.

You can typically configure such properties using one of three methods:

1.  **A Configuration Object (Plain JavaScript Object):**
  Provide a plain JavaScript object with the desired properties. Neo.mjs will automatically create an instance of the
  expected class (e.g., `Neo.data.Store` for the `store` config) using this object as its configuration. This is ideal
  for inline, simple definitions.

    ```javascript readonly
    store: { // Neo.mjs will create a Store instance from this config
        model: { fields: [{name: 'id'}, {name: 'name'}] },
        data: [{id: 1, name: 'Item 1'}]
    }
    ```

2.  **A Class Reference:**
  Pass a direct reference to the Neo.mjs class. The engine will automatically instantiate this class when the
  component is created.

    ```javascript readonly
    import MyCustomStore from './MyCustomStore.mjs';

    // ...
    store: MyCustomStore // Neo.mjs will create an instance of MyCustomStore
    ```

3.  **A Pre-created Instance:**
    Provide an already instantiated Neo.mjs object (typically created using`Neo.create()`). This is useful when you need
    to share a single instance across multiple components or manage its lifecycle externally.

    ```javascript readonly
    const mySharedStore = Neo.create(Neo.data.Store, { /* ... */ });

    // ...
    store: mySharedStore // Pass an already existing Store instance
    ```

This flexibility allows you to choose the most convenient and appropriate configuration style for your specific use case,
from quick inline setups to robust, reusable class-based architectures.

### Real-World Example: `Neo.grid.Container`'s `store` config

A prime example of `beforeSetInstance` in action is the `store` config within `Neo.grid.Container`.
The `beforeSetStore` hook ensures that the `store` property always holds a valid `Neo.data.Store` instance,
regardless of how it was initially configured.

```javascript readonly
import ClassSystemUtil from '../../src/util/ClassSystem.mjs';
import Store           from '../../src/data/Store.mjs';

class GridContainer extends Neo.container.Base {
    static config = {
        className: 'Neo.grid.Container',
        store_   : null // The reactive store config
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Object|Neo.data.Store|null} value
     * @param {Neo.data.Store}             oldValue
     * @protected
     */
    beforeSetStore(value, oldValue) {
        if (value) {
            // This ensures that 'value' is always a Neo.data.Store instance.
            // It handles plain objects (creating a new Store), class references,
            // or pre-existing instances.
            value = ClassSystemUtil.beforeSetInstance(value, Store);
        }
        return value;
    }

    // ... other methods
}

Neo.setupClass(GridContainer);
```

In this example, `ClassSystemUtil.beforeSetInstance(value, Store)` intelligently processes the `value`:
*   If `value` is a plain JavaScript object, it creates a new `Neo.data.Store` instance using that object as its config.
*   If `value` is a `Neo.data.Store` class reference, it instantiates that class.
*   If `value` is already a `Neo.data.Store` instance, it returns it as is.

This pattern is crucial for providing a flexible yet robust API for configuring complex properties.

## 5. The Role of `Neo.setupClass()` and the Global `Neo` Namespace

When you define a class in Neo.mjs and pass it to `Neo.setupClass()`, the engine performs several crucial operations.
One of the most significant is to **enhance the global `Neo` namespace** with a reference to your newly defined class.

This means that after `Neo.setupClass(MyClass)` is executed, your class becomes accessible globally via
`Neo.[your.class.name]`, where `[your.class.name]` corresponds to the `className` config you defined (e.g.,
`Neo.button.Base`, `Neo.form.field.Text`, or your custom `My.Custom.Class`).

**Implications for Class Extension and Usage:**

* **Global Accessibility**: You can refer to any core class (or your own custom classes after they've been set
  up) using their full `Neo` namespace path (e.g., `Neo.button.Base`, `Neo.container.Base`) anywhere in your
  application code, even
  without an explicit ES module import for that specific class.
* **Convenience vs. Best Practice**: While `extends Neo.button.Base` might technically work without an
  `import Button from '...'`, it is generally **not recommended** for application code. Explicit ES module imports
  (e.g., `import Button from '../button/Base.mjs';`) are preferred because they:
  * **Improve Readability**: Clearly show the dependencies of your module.
  * **Enhance Tooling**: Enable better static analysis, auto-completion, and refactoring support in modern IDEs.
  * **Ensure Consistency**: Promote a consistent and predictable coding style.
* **Engine Internal Use**: The global `Neo` namespace is heavily utilized internally by the engine itself for
  its class registry, dependency resolution, and dynamic instantiation (e.g., when using `ntype` or `module` configs).

### Automatic `is<Ntype>` Type Flags

Enhancing the global namespace is not the only thing `setupClass()` does. It also derives a boolean `is<Ntype>` flag
on the prototype for every `ntype` in the class's chain — `ntype: 'tree-store'` yields `isTreeStore`, and a
`TreeStore` also carries its ancestors' `isStore`. That gives a subtype test needing no `instanceof` and no import of
the class being tested against, so a base class can branch on a subtype without taking a dependency edge on it:

```javascript
// src/grid/Container.mjs — a TreeStore turns the grid into a TreeGrid; a plain Store does not
me.isTreeGrid = value?.isTreeStore === true;
```

Because the names are **computed at runtime**, a source search cannot find where they are set: `grep isTreeStore src/`
matches only the line that *reads* the flag. One hit at a read site is not evidence of a dangling reference.

See [Class Compilation → Synthesizing `is<Ntype>` Type Flags](../coreengine/SetupClass.md#3-synthesizing-isntype-type-flags)
for the derivation, the chain-walk semantics, and how this differs from the trailing-underscore reactive API.

Understanding this mechanism clarifies how Neo.mjs manages its class system and provides the underlying flexibility for
its configuration-driven approach.

## 6. Practical Examples: Models, Stores, and Controllers

The principles of class extension apply universally across all Neo.mjs class types.

### Extending `Neo.data.Model`

Models define the structure and behavior of individual data records. While reactive configs can be used for class-level
properties of a Model (e.g., a global setting for all products), properties that vary per record (like `price` or
`discount`) should be defined as fields within the `fields` array. Neo.mjs provides `convert` and `calculate`
functions directly on field definitions for per-record logic.

```javascript readonly
import Model from '../../src/data/Model.mjs';

class ProductModel extends Model {
    static config = {
        className: 'App.model.Product',
        fields: [
            {name: 'id',    type: 'Number'},
            {name: 'name',  type: 'String'},
            {name: 'price', type: 'Number', defaultValue: 0,
                // Use a convert function for field-level validation or transformation
                convert: value => {
                    if (typeof value !== 'number' || value < 0) {
                        console.warn('Price field must be a non-negative number!');
                        return 0;
                    }
                    return value;
                }
            },
            {name: 'discount', type: 'Number', defaultValue: 0,
                // Use a convert function for field-level validation or transformation
                convert: value => {
                    if (typeof value !== 'number' || value < 0 || value > 1) {
                        console.warn('Discount field must be a number between 0 and 1!');
                        return 0;
                    }
                    return value;
                }
            },
            {name: 'discountedPrice', type: 'Number',
                // Use a calculate function for derived values based on other fields in the record
                calculate: (data) => {
                    // 'data' contains the raw field values of the current record
                    return data.price * (1 - data.discount);
                }
            }
        ]
    }
}

Neo.setupClass(ProductModel);
```

### Extending `Neo.data.Store`

Stores manage collections of data records, often using a defined `Model`.

```javascript readonly
import Store        from '../../src/data/Store.mjs';
import ProductModel from './ProductModel.mjs'; // Assuming ProductModel is in the same directory

class ProductsStore extends Store {
    static config = {
        className: 'App.store.Products',
        model    : ProductModel, // Use our custom ProductModel
        autoLoad : true,
        url      : '/api/products', // Example API endpoint
        sorters  : [{
            property : 'name',
            direction: 'ASC'
        }]
    }

    // Custom method to filter by price range
    filterByPriceRange(min, max) {
        // The idiomatic way to apply filters is by setting the 'filters' config.
        // This replaces any existing filters.
        this.filters = [{
            property: 'price',
            operator: '>=',
            value   : min
        }, {
            property: 'price',
            operator: '<=',
            value   : max
        }];
    }

    // To add filters without replacing existing ones, you would typically
    // read the current filters, add new ones, and then set the filters config.
    // Example (conceptual, not part of the class):
    /*
    addPriceRangeFilter(min, max) {
        const currentFilters = this.filters ? [...this.filters] : [];
        currentFilters.push({
            property: 'price',
            operator: '>=',
            value   : min
        }, {
            property: 'price',
            operator: '<=',
            value   : max
        });
        this.filters = currentFilters;
    }
    */
}

Neo.setupClass(ProductsStore);
```

### Extending `Neo.controller.Component`

Controllers encapsulate logic related to components, often handling events or managing state.

```javascript readonly
import ComponentController from '../../src/controller/Component.mjs';

class MyCustomController extends ComponentController {
    static config = {
        className: 'App.controller.MyCustom',
        // A reactive property to manage a piece of controller-specific state
        isActive_: false
    }

    onConstructed() {
        super.onConstructed();
        console.log('MyCustomController constructed!');
    }

    afterSetIsActive(value, oldValue) {
        console.log(`Controller active state changed from ${oldValue} to ${value}`);
        // Perform actions based on active state change
        if (value) {
            this.doSomethingActive();
        } else {
            this.doSomethingInactive();
        }
    }

    doSomethingActive() {
        console.log('Controller is now active!');
        // Example: enable a feature, start a timer
    }

    doSomethingInactive() {
        console.log('Controller is now inactive!');
        // Example: disable a feature, clear a timer
    }
}

Neo.setupClass(MyCustomController);
```

## Conclusion

The class extension mechanism, coupled with the reactive config system and `Neo.setupClass()`, forms the backbone of
development in Neo.mjs. By mastering these principles, you can create highly modular, maintainable, and powerful
applications that seamlessly integrate with the engine's core.
