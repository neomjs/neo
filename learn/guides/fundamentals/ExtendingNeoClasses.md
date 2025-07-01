# Extending Neo Classes

Neo.mjs is built upon a robust and consistent class system. Understanding how to extend framework classes is fundamental to building custom functionality, whether you're creating new UI components, defining data structures, or implementing application logic.

This guide covers the universal principles of class extension in Neo.mjs, which apply across all class types, not just UI components.

## 1. The `static config` Block: Defining Properties

Every Neo.mjs class utilizes a `static config` block. This is where you define the properties that instances of your class will possess. These properties can be simple values, objects, or even other Neo.mjs class configurations.

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

Common configs you'll encounter include `className` (a unique string identifier for your class) and `ntype` (a shorthand alias for component creation).

## 2. Reactive Configs: The Trailing Underscore (`_`)

A cornerstone of Neo.mjs's reactivity is the trailing underscore (`_`) convention for configs defined in `static config`. When you append an underscore to a config name (e.g., `myConfig_`), the framework automatically generates a reactive getter and setter for it.

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

Assigning a new value to a reactive property (e.g., `this.myReactiveProp = 'new value'`) triggers its setter, which in turn can invoke lifecycle hooks, enabling automatic updates and side effects. Properties without the underscore are static and do not trigger this reactive behavior.

## 3. Configuration Lifecycle Hooks (`beforeSet`, `afterSet`, `beforeGet`)

For every reactive config (`myConfig_`), Neo.mjs provides three optional lifecycle hooks that you can implement in your class. These methods are automatically called by the framework during the config's lifecycle, offering powerful interception points:

*   **`beforeSetMyConfig(value, oldValue)`**:
    *   **Purpose**: Intercepts the value *before* it is set. Ideal for validation, type coercion, or transforming the incoming value.
    *   **Return Value**: Return the (potentially modified) `value` that should be set. Returning `undefined` or `null` will prevent the value from being set.

*   **`afterSetMyConfig(value, oldValue)`**:
    *   **Purpose**: Executed *after* the value has been successfully set. Ideal for triggering side effects, updating the UI (e.g., calling `this.update()` for components), or firing events.
    *   **Return Value**: None.

*   **`beforeGetMyConfig(value)`**:
    *   **Purpose**: Intercepts the value *before* it is returned by the getter. Useful for lazy initialization, computing values on demand, or returning a transformed version of the stored value.
    *   **Return Value**: Return the `value` that should be returned by the getter.

### Overriding Lifecycle Hooks: `super` vs. Full Override

When extending a Neo.mjs class, you often need to customize the behavior of inherited lifecycle hooks (like `afterSet*`, `onConstructed`, etc.). You have two primary approaches:

#### 1. Extending Parent Behavior (Calling `super`)

This is the most common and recommended approach. By calling `super.methodName(...)`, you ensure that the parent class's implementation of the hook is executed. You can then add your custom logic either before or after the `super` call.

This approach is crucial for maintaining the framework's intended behavior and ensuring that inherited features continue to function correctly.

```javascript readonly
import Button from '../../src/button/Base.mjs';

class MyExtendedButton extends Button {
    static config = {
        className: 'My.Extended.Component',
        // text_ config is inherited from Button.Base
        // We can set a default value here if needed, or rely on button.Base's default
        text: 'New Default Text'
    }

    // Example: Adding logic after the parent's afterSetText
    afterSetText(value, oldValue) {
        //  Add your custom pre-processing logic here
        super.afterSetText(value, oldValue);
        console.log(`Custom logic: Button text changed to "${value}"`);
        // Add your custom post-processing logic here
    }
}

export default Neo.setupClass(MyExtendedButton);
```

#### 2. Completely Overriding Parent Behavior (No `super` Call)

In rare cases, you might want to completely replace the parent class's implementation of a hook. This is achieved by simply omitting the `super` call within your overridden method.

**Caution**: Use this approach with extreme care. You must fully understand the parent's implementation and ensure that your override does not break essential framework functionality or inherited features. This is generally reserved for advanced scenarios where you need full control over the hook's execution.

```javascript readonly
import Button from '../../src/button/Base.mjs';

class MyFullyOverriddenButton extends Button {
    static config = {
        className: 'My.Fully.Overridden.Component',
        text     : 'New Default Text'
    }

    // Example: Completely overriding afterSetText
    afterSetText(value, oldValue) {
        // No super.afterSetText(value, oldValue); call
        console.log(`Fully custom logic: Button text changed to "${value}"`);
        // The parent's afterSetText will NOT be executed
        // This means that in this case you need to take care on your own to map the text value to the vdom.
    }
}

export default Neo.setupClass(MyFullyOverriddenButton);
```



```javascript readonly
class MyHookedClass extends Neo.core.Base {
    static config = {
        className: 'My.Hooked.Class',
        myValue_ : 0
    }

    beforeSetMyValue(value, oldValue) {
        if (typeof value !== 'number' || value < 0) {
            console.warn('myValue must be a non-negative number!');
            return 0; // Default to 0 if invalid
        }
        return value;
    }

    afterSetMyValue(value, oldValue) {
        console.log(`myValue changed from ${oldValue} to ${value}`);
        // In a component, you might call this.update() here
    }

    beforeGetMyValue(value) {
        // Example: lazy initialization or computed value
        if (value === 0 && !this._initialized) {
            console.log('Initializing myValue on first access');
            this._initialized = true;
            return 10; // Return a default initial value
        }
        return value;
    }
}

export default Neo.setupClass(MyHookedClass);
```

## 4. The Role of `Neo.setupClass()` and the Global `Neo` Namespace

When you define a class in Neo.mjs and pass it to `Neo.setupClass()`, the framework performs several crucial operations. One of the most significant is to **enhance the global `Neo` namespace** with a reference to your newly defined class.

This means that after `Neo.setupClass(MyClass)` is executed, your class becomes accessible globally via `Neo.[your.class.name]`, where `[your.class.name]` corresponds to the `className` config you defined (e.g., `Neo.button.Base`, `Neo.form.field.Text`, or your custom `My.Custom.Class`).

**Implications for Class Extension and Usage:**

*   **Global Accessibility**: You can refer to any framework class (or your own custom classes after they've been set up) using their full `Neo` namespace path (e.g., `Neo.button.Base`, `Neo.container.Base`) anywhere in your application code, even without an explicit ES module import for that specific class.
*   **Convenience vs. Best Practice**: While `extends Neo.button.Base` might technically work without an `import Button from '...'`, it is generally **not recommended** for application code. Explicit ES module imports (e.g., `import Button from '../button/Base.mjs';`) are preferred because they:
    *   **Improve Readability**: Clearly show the dependencies of your module.
    *   **Enhance Tooling**: Enable better static analysis, auto-completion, and refactoring support in modern IDEs.
    *   **Ensure Consistency**: Promote a consistent and predictable coding style.
*   **Framework Internal Use**: The global `Neo` namespace is heavily utilized internally by the framework itself for its class registry, dependency resolution, and dynamic instantiation (e.g., when using `ntype` or `module` configs).

Understanding this mechanism clarifies how Neo.mjs manages its class system and provides the underlying flexibility for its configuration-driven approach.

## 5. Practical Examples: Models, Stores, and Controllers

The principles of class extension apply universally across all Neo.mjs class types.

### Extending `Neo.data.Model`

Models define the structure and behavior of individual data records. While reactive configs can be used for class-level properties of a Model (e.g., a global setting for all products), properties that vary per record (like `price` or `discount`) should be defined as fields within the `fields` array. Neo.mjs provides `convert` and `calculate` functions directly on field definitions for per-record logic.

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

The class extension mechanism, coupled with the reactive config system and `Neo.setupClass()`, forms the backbone of development in Neo.mjs. By mastering these principles, you can create highly modular, maintainable, and powerful applications that seamlessly integrate with the framework's core.
