A Declarative Approach to Application Building

## Introduction

Modern JavaScript frameworks have revolutionized front-end development by providing declarative ways to build
user interfaces, primarily centered around enhancing HTML with custom syntax like JSX or Angular directives.
However, the complexity of applications extends far beyond the Document Object Model (DOM), encompassing crucial 
non-DOM entities such as data stores, state providers, routers, view controllers, selection models, and layouts.

While existing frameworks offer solutions for managing these aspects, they often lack a truly consistent, declarative,
and nested approach to their configuration, a gap that a class config system aims to fill.

### The Problem with Disparate Configuration

Currently, the configuration and management of these non-DOM entities can feel somewhat disparate across different
frameworks. State management, for instance, might involve dedicated libraries (like Redux or Vuex), routing is handled
by router-specific configurations, and layouts might be defined through a mix of component composition and potentially
separate layout configurations. While these solutions are functional, they don't always present a unified configuration
tree that mirrors the nested, hierarchical structure often used for describing the UI. The syntax and patterns for
configuring a data store can be quite different from those used to define a route or a view controller.

Consider this Angular code snippet (from a new public API draft):

```javascript readonly
// MyComponent with an attribute
<MyComponent myAttribute="someValue" />

// MyComponent with an input binding
<MyComponent [myInput]="mySignal()" />

// MyComponent is the host element
<MyComponent @MyDirective />

// Same as the selector: a[mat-button], anchor element is the host element
<MatButton:a></MatButton:a>

// Scoped inputs for MyDirective
<MyComponent @MyDirective(input1="someString" [input2]="mySignal()") />
```

This example illustrates how various aspects (attributes, input bindings, directives, host elements, scoped inputs) are
configured using distinct syntax patterns. While functional, this variety can increase the cognitive load on developers,
requiring them to constantly context-switch between different configuration paradigms for different elements.

More importantly, the entire syntax is strictly limited to DOM-based entities.

### Neo.mjs's Solution: A Unified Class Config System

This is where the benefit of a class config system becomes apparent. The vision in Neo.mjs is a system that allows
developers to describe the desired state and relationships of all application components—regardless of whether they
directly interact with the DOM—using a consistent, declarative, and nested configuration structure.

Imagine defining your application's data stores, their initial states, and how they relate to each other, alongside the
routes of your application, the view controllers responsible for handling those routes, and the layouts they will
use – all within a unified configuration syntax. This nested structure clearly illustrates the dependencies and
composition of the application's various parts, offering a holistic view that is often obscured when non-DOM elements
are configured in isolation using different mechanisms.

Neo.mjs achieves this by leveraging a powerful static config object pattern. You define properties and their default
values directly within your class definitions. When you create an instance of that class using Neo.create(), you can
override these defaults, and the framework automatically processes these configurations to instantiate and configure
components, data models, routes, and more. This mechanism applies consistently across all Neo.mjs classes.

## Key Advantages

A class config system, by treating all application entities as configurable classes within a unified hierarchy,
offers several key advantages:

* **Consistency**: Provides a single, predictable way to configure any part of the application, reducing the cognitive
  load on developers who would otherwise need to learn and context-switch between different configuration paradigms for DOM and non-DOM elements.

* **Declarative Clarity**: Enables developers to declare the desired state and relationships of their application's
  components in a clear and concise manner, rather than writing imperative code to set up and connect these entities.
  This significantly improves readability and maintainability.

* **Nested Structure**: Allows for the natural expression of hierarchical relationships between components, whether they
  are parent-child UI elements or a router managing various routes, each with associated view controllers and data requirements.
  This mirrors the often tree-like structure of applications.

* **Improved Maintainability**: Changes to the application's structure or behavior can be made in a centralized and
  organized configuration, rather than spread across various imperative code snippets and disparate configuration files.
  This leads to a more predictable and manageable codebase.

* **Enhanced Tooling and Abstraction**: A unified system provides a solid foundation for building powerful development tools,
  such as visual editors or automatic documentation generators, that can understand and manipulate the entire application's
  structure. It also allows for higher levels of abstraction, potentially simplifying the definition of complex application patterns.

* **Reactive Configuration**: Similar to how UI frameworks react to state changes and update the DOM, a reactive class config
  system can react to changes in the configuration itself (in a development context, for example) to facilitate hot module
  replacement or dynamic updates of non-DOM entities. This is a powerful capability for developer productivity.

While existing frameworks have made significant strides in declarative UI development, the concept of extending this
declarative, nested configuration approach consistently to all aspects of an application, particularly the non-DOM realm,
represents a powerful next step. Neo.mjs's class config system holds the promise of a more unified, maintainable, and
understandable way to build complex modern web applications.

## The static config Block: Your Declarative Blueprint

Every Neo.mjs class, from UI components to data models and utility classes, can define a `static config` object.
This object serves as the blueprint for instances of that class, declaring their properties, default values,
and how they interact.

### 1. Basic Component Configuration: The Neo.mjs Button

Let's start with a simple example: configuring a button. In Neo.mjs, even fundamental UI elements like buttons
are highly configurable classes.

Consider the `Neo.button.Base class`
[[Source: button.Base.mjs](https://github.com/neomjs/neo/blob/dev/src/button/Base.mjs)],
Its static config block defines all the properties you can set to customize a button's appearance and behavior:

```javascript readonly
// From: Neo.button.Base
class Button extends Component {
    static config = {
        className: 'Neo.button.Base',
        ntype    : 'button',
        text     : null, // The text displayed on the button
        iconCls_ : null, // The CSS class to use for an icon, e.g. 'fa fa-home'
        handler_ : null, // Shortcut for domListeners={click:handler}
        route_   : null, // Change the browser hash value on click.

        // The virtual DOM structure of the button
        // (not used parts will not show up inside the live DOM)
        _vdom: { 
            tag: 'button', type: 'button', cn: [
                {tag: 'span', cls: ['neo-button-glyph']},
                {tag: 'span', cls: ['neo-button-text']},
                {cls: ['neo-button-badge']},
                {cls: ['neo-button-ripple-wrapper'], cn: [
                    {cls: ['neo-button-ripple']}
                ]}
            ]
        }
        // ... many other properties like badgeText_, iconPosition_, menu_, pressed_, etc.
    }
    // ... rest of the class definition
}
```

### Instantiating and Configuring a Button

To create an instance of this button and apply your desired configuration, you use `Neo.create()` or `Neo.ntype()`:

```javascript readonly
import Button fron '../../src/button/Base.mjs';

// A simple button
Neo.create({
    module : Button,
    text   : 'Click Me',
    handler: () => alert('Button clicked!')
});

// A button with an icon and route
Neo.ntype({
    ntype       : 'button',
    text        : 'Go Home',
    iconCls     : 'fa fa-home', // Uses Font Awesome icon
    iconPosition: 'left',       // Icon on the left
    route       : '#main/home'  // Changes browser hash to #main/home on click
});
```

Notice how `text`, `iconCls`, `iconPosition`, and `route` are simply properties passed into the configuration object.
The framework takes care of applying these values to the button instance and rendering its virtual DOM (`_vdom) accordingly.

### 2. Nested Component Configuration: Containers and the items Property

Neo.mjs components can be nested to create complex UIs, forming a hierarchical tree structure. This is managed consistently
through container components and their `items` configuration.

The `Neo.container.Base` class
[[Source: container.Base.mjs](https://github.com/neomjs/neo/blob/dev/src/container/Base.mjs)],
is fundamental for building UIs with multiple child components. It provides a `static config`
property called `items_`, which is an array or object containing configurations for its children. It also includes a `layout_`
property to define how these items are arranged.

Here's a simplified look at the relevant parts of `Neo.container.Base`'s config:

```javascript readonly
// From: Neo.container.Base
class Container extends Component {
    static config = {
        className: 'Neo.container.Base',
        ntype: 'container',
        // ... other properties
        /**
         * Defines the layout manager for the container's items.
         * @member {Object|String|null} layout_={ntype: 'vbox', align: 'stretch'}
         */
        layout_: {
            ntype: 'vbox',
            align: 'stretch'
        },
        /**
         * An array or an object of config objects|instances|modules for each child component
         * @member {Object[]} items_=[]
         */
        items_: [],
        // ... other properties
    }
    // ... rest of the class definition
}
```

The `items_` config allows for flexible ways to define children:

* **By ntype**: A string alias for the component's className.
* **By imported module**: Directly referencing the imported class.
* **By instance**: Passing an already created Neo.mjs component instance.

### Example: A Container with Nested Buttons

Let's create a container with a vertical box layout and several buttons inside it,
demonstrating different ways to configure items:

```javascript readonly
import Button from '../../src/button/Base.mjs'; // Assuming Button is imported correctly

Neo.ntype({
    ntype: 'container',
    layout: {
        ntype: 'vbox', // Vertical box layout
        align: 'center' // Center items horizontally
    },
    items: [ // Define child components within the 'items' array
        { // Configured by ntype
            ntype: 'button',
            text : 'Button 1 (by ntype)'
        },
        { // Configured by imported module
            module: Button,
            text  : 'Button 2 (by module)'
        },
        Neo.create({ // Configured by instance
            module: Button,
            text  : 'Button 3 (by instance)'
        }),
        { // Another button with a handler
            className: 'Neo.button.Base',
            text     : 'Hello Alert',
            handler  : () => console.log('Hello from a nested button!')
        }
    ]
});
```

This example clearly shows how the `items` config allows for a declarative, nested structure, effectively building a UI tree.
The `layout` config further specifies how these children are arranged within the container,
all using the same consistent configuration syntax.

Note: While this section demonstrates container configuration, a comprehensive guide on Neo.mjs containers and their
various layouts (e.g., `vbox`, `hbox`, `fit`, `card`, `grid`) will be provided in a separate, dedicated guide to maintain
a sharp focus on the core class config system here.

### 3. Non-DOM Entity Configuration: Data Stores and Models

Beyond UI components, the class config system extends seamlessly to non-DOM entities like data stores and models,
allowing for a unified declarative approach to your application's data layer.

**Defining a Data Store** (`Neo.data.Store`)

A `Neo.data.Store` manages collections of data records, often fetched from a server or generated client-side.
The `static config` for a store allows you to define its associated data model, filters, and other properties.

Here's an example from `Neo.examples.grid.bigData.MainStore`
[[Source: MainStore.mjs](https://github.com/neomjs/neo/blob/dev/examples/grid/bigData/MainStore.mjs)]:

```javascript readonly
import Model from './MainModel.mjs'; // Assuming MainModel.mjs defines a Neo.data.Model
import Store from '../../../src/data/Store.mjs';

class MainStore extends Store {
    static config = {
        className     : 'Neo.examples.grid.bigData.MainStore',
        ntype         : 'mainstore', // Custom ntype for easy referencing
        amountColumns_: 50,
        amountRows_   : 1000,

        // Define default filters declaratively
        filters: [{ 
            property: 'firstname',
            operator: 'like',
            value   : null
        }, {
            property: 'lastname',
            operator: 'like',
            value   : null
        }],
        model: Model // Associate a data model with this store
    }
    // ... other properties and methods like firstnames, lastnames, generateData, etc.
}

export default Neo.setupClass(MainStore);
```

In this example:

* `amountColumns_` and `amountRows_` define initial data dimensions.
* The `filters` array declaratively sets up default filtering rules.
* The `model` property specifies which `Neo.data.Model` class instances in this store will adhere to.
  This creates a powerful, type-safe data structure.

**Connecting a Store to a Grid**

One common use case is connecting a data store to a UI component like a grid. `The Neo.grid.Container`
(which GridContainer extends) also uses the class config system to specify its data `store`.

Here's how `Neo.examples.grid.bigData.GridContainer`
[[Source: GridContainer.mjs](https://github.com/neomjs/neo/blob/dev/examples/grid/bigData/GridContainer.mjs)]
connects to the `MainStore`:

```javascript readonly
import BaseGridContainer from '../../../src/grid/Container.mjs';
import Button            from '../../../src/button/Base.mjs';
import MainStore         from './MainStore.mjs';

class GridContainer extends BaseGridContainer {
    static config = {
        className: 'Neo.examples.grid.bigData.GridContainer',
        // ... other grid-specific configurations
        store: MainStore // The grid declaratively specifies which store to use
    }
    // ...
}

export default Neo.setupClass(GridContainer);
```

By simply assigning `MainStore` to the `store` config property, the `GridContainer` instance will automatically use the data
provided and managed by `MainStore`. This demonstrates the seamless integration of non-DOM data logic with DOM-rendering
components through a consistent declarative config system.

**Note**: This section focuses on how grid's `store config property integrates with the class config system. A detailed
explanation of all grid features, column configurations, and data handling methods will be covered in a
separate Grid Component guide.

### 4. Configuring Controllers and State Providers for Application Logic

Neo.mjs's declarative configuration extends to application logic components such as controllers and state providers,
allowing you to define their association and initial properties directly within the `static config` of your views or other classes.
This offers significant flexibility in how these non-DOM entities are managed.

**Important Best Practice**:

It's a core Neo.mjs best practice that controllers and state providers are typically associated with non-leaf (container)
components, such as `Viewport`s or other top-level application containers, rather than individual leaf-node UI components
(like a `Button` or `Label`). This promotes a clear separation of concerns, keeping complex logic centralized and allowing
leaf components to remain focused on their rendering responsibilities. A `Viewport`, for example, often manages overall
application state, routing, and user interactions, making it a natural home for a controller and state provider.

Consider the `Portal.view.Viewport` class
[[Source: Viewport.mjs](https://github.com/neomjs/neo/blob/dev/apps/portal/view/Viewport.mjs)],
which effectively utilizes both a controller and a state provider for application-level concerns:

```javascript readonly
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

class Viewport extends BaseViewport {
    static config = {
        className    : 'Portal.view.Viewport',
        controller   : ViewportController,   // Option 1: Direct module reference
        // ... layout, items
        stateProvider: ViewportStateProvider // Option 1: Direct module reference
    }
    // ... rest of the class
}
```

Neo.mjs provides several ways to configure these entities within the `static config` block:

1. **Direct Module Reference (Most Common)**</br>
  You can directly provide the imported class module to the controller or stateProvider config.
  Neo.mjs will automatically create an instance of that class and assign it to the property.
  This is the simplest and most common approach, as seen in the Viewport example above.
  ```javascript readonly
// In MyContainer.mjs (a non-leaf component)
import MyController from './MyController.mjs';

class MyContainer extends Container {
    static config = {
        controller: MyController // Neo.mjs will instantiate MyController
    }
}
  ```

2. **Config Object with `module`**</br>
  If you need to pass additional configuration properties to the controller or state provider at the time of its creation,
  you can provide a config object that includes the `module` property along with any other desired properties.
  Neo.mjs will use this full config object to create the instance.
  ```javascript readonly
// In MyContainer.mjs
import MyController from './MyController.mjs';

class MyContainer extends Container {
    static config = {
        controller: {
            module          : MyController,
            myCustomProperty: 'initialValue',
            anotherSetting  : true
        }
    }
}
  ```

3.  **Inline Class Definition (for tightly coupled cases)** </br>
  For very specific or small controllers/state providers that are tightly coupled to a single component and don't
  require external reusability, you can define them inline as a nested configuration object within the component's config.
  While this reduces external reusability, it keeps highly related code together and maintains the declarative paradigm.
  ```javascript readonly
// In MyContainer.mjs
class MyContainer extends Container {
    static config = {
        stateProvider: {
            data: {
                foo: 'bar'
            }
        }
    }
}
  ```
  This approach allows you to fully define the state provider's behavior and dependencies directly within the container's configuration.

These options provide a powerful and consistent way to inject behavior and state management into your components,
all within the unified class config system, further demonstrating its versatility for both UI and non-UI logic.

**Note**: This section focuses on the configuration methods for controllers and state providers. Detailed explanations of
controller methods, state management patterns, and specific API functionalities will be covered in dedicated guides on
Controllers and State Management.

### 5. Non-DOM Entity Configuration: Routing with routes

Neo.mjs enables declarative routing directly within the static config of your controllers (or other relevant classes), often a ViewportController for top-level application navigation. This allows you to define URL hash patterns and map them to specific controller methods, creating a clear, maintainable routing system.

Consider the ViewportController.mjs
[[Source: ViewportController.mjs](https://github.com/neomjs/neo/blob/dev/apps/portal/view/ViewportController.mjs)]:

```javascript readonly
// From: Portal.view.ViewportController
import Controller        from '../../../src/controller/Component.mjs';
// ... other imports

class ViewportController extends Controller {
    static config = {
        className: 'Portal.view.ViewportController',
        ntype    : 'viewport-controller',
        // ... other configurations
        /**
         * @member {Object} routes
         */
        routes: {
            '/about-us'         : 'onAboutUsRoute',
            '/blog'             : 'onBlogRoute',
            '/docs'             : 'onDocsRoute',
            '/examples'         : 'onExamplesRoute',
            '/examples/{itemId}': 'onExamplesRoute',
            '/home'             : 'onHomeRoute',
            '/learn'            : 'onLearnRoute',
            '/learn/{itemId}'   : 'onLearnRoute',
            '/services'         : 'onServicesRoute'
        },
        // ... other configurations
    }
    // ... controller methods like onAboutUsRoute, onBlogRoute, etc.
}
```

In this `ViewportController`'s `static config`:

* The `routes` object maps URL hash patterns (keys) to controller method names (values).

* For example, when the browser's hash changes to `#/home`, the `onHomeRoute` method within `ViewportController` is automatically invoked.

* Routes can include dynamic parameters using curly braces, like `/examples/{itemId}`. When such a route is matched
  (e.g., `#/examples/my-component`), the `onExamplesRoute` method will be called, and the `itemId` value (`my-component`)
  will be passed as a parameter to the method.

* This declarative setup centralizes your application's routing logic, making it easy to understand the application's
  navigation paths and their corresponding actions at a glance.

* The controller methods, such as `onHomeRoute`, then typically manage the application's UI state based on the route,
  for instance, by setting the `activeIndex` of a card layout container to display the correct view:

```javascript readonly
// From: Portal.view.ViewportController
// ...
    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHomeRoute(params, value, oldValue) {
      this.setMainContentIndex(0)
    }
    
    /**
     * @param {Number} index
     */
    async setMainContentIndex(index) {
      let me                               = this,
          {activeIndex, mainContentLayout} = me,
          container                        = me.getReference('main-content');
      // ... logic to update the main content container's activeIndex
      if (index !== activeIndex) {
        me.activeIndex = index;
        // ... more complex layout transition logic
        container.layout.activeIndex = index;
      }
    }
```

This demonstrates a complete declarative flow: the `static config` defines the routes, which then trigger methods within
the same controller to update the UI, all within a consistent declarative pattern.

**Note**: This section focuses on how routes are defined and linked to controller methods through the `static config`.
A comprehensive guide on Neo.mjs routing, including advanced features like route guards, nested routes, and router
history management, will be provided in a separate, dedicated guide.

### 6. Dynamic Configuration & afterSet Handlers: An In-depth Example

Let's further explore dynamic configuration changes and the role of `afterSet` methods with the Neo.examples.core.config.
MainContainer [Source: MainContainer.mjs]. This example highlights how declarative UI structures defined in
static config can be combined with reactive updates based on other config properties.

**Original MainContainer with items in construct (for context)**

The original `MainContainer.mjs` defined its `items` array inside the `construct` method.
This allowed for procedural creation of child components.

```javascript readonly
// From: Neo.examples.core.config.MainContainer (original approach)
import Panel    from '../../../src/container/Panel.mjs';
import Viewport from '../../../src/container/Viewport.mjs';

class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.core.config.MainContainer',
        a_       : null,
        b_       : null,
        style    : { padding: '20px' }
    }
    
    construct(config) {
        super.construct(config);
        let me = this;

        me.items = [{ // Items defined here
            module: Panel,
            containerConfig: { layout: {ntype: 'vbox', align: 'start'}, style : {padding: '20px'} },
            headers: [{
                dock : 'top',
                items: [{ ntype: 'label', flag : 'label1' }, { ntype: 'label', flag : 'label2' }, { ntype: 'component', flex : 1 }, {
                    handler: me.changeConfig.bind(me), // Bound handler
                    iconCls: 'fa fa-user',
                    text   : 'Change configs'
                }]
            }],
            items: [{ ntype: 'label', text : 'Click the change configs button!' }]
          }]
    }
    // ... changeConfig, afterSetA, afterSetB, onConstructed methods
}
```

**Refactored `MainContainer` with `items` in `static config` and Declarative Handler**

To fully embrace the declarative nature of the class config system, the entire `items` array can be moved into the
`static config` block. This makes the component's structure visible at a glance within its static definition.
When moving the `handler`, we can leverage Neo.mjs's declarative event handling by using `'up.methodName'`,
which tells the framework to look for methodName on the direct parent instance or higher in the component hierarchy.

```javascript readonly
// Refactored Neo.examples.core.config.MainContainer (recommended approach)
import Panel    from '../../../src/container/Panel.mjs';
import Viewport from '../../../src/container/Viewport.mjs';

class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.core.config.MainContainer',
        a_       : null,
        b_       : null,
        style    : { padding: '20px' },
        /**
         * @member {Object[]} items
         */
        items: [{ // Items now defined declaratively within static config
            module: Panel,
            containerConfig: {
                layout: {ntype: 'vbox', align: 'start'},
                style : {padding: '20px'}
            },
            headers: [{
                dock : 'top',
                items: [{
                    ntype: 'label',
                    flag : 'label1'
                }, {
                    ntype: 'label',
                    flag : 'label2'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    handler  : 'up.changeConfig', // Declarative handler: 'up' references the parent instance (MainContainer)
                    iconCls  : 'fa fa-user',
                    text     : 'Change configs'
                }]
            }],
            items: [{
                ntype: 'label',
                text : 'Click the change configs button!'
            }]
        }]
    }

    // `construct` method would now be simpler or removed if no other logic is needed here
    construct(config) {
        super.construct(config);
        // Any other non-config related construction logic would go here
    }

    // ... changeConfig, afterSetA, afterSetB, onConstructed methods (remain the same)
}
```

This refactored version clearly demonstrates the power of defining the entire component hierarchy and event wiring
declaratively within `static config`, reducing the need for imperative UI construction in `construct`.

**Initializing Config Values with `onConstructed`**

The `onConstructed` lifecycle method sets the initial values of `a` and `b`:

```javascript readonly
    onConstructed() {
        super.onConstructed();
      
        this.set({
            a: 5,
            b: 5
        })
    }
```

When `this.set({a: 5, b: 5})` is called, both `this.a` and `this.b` are updated to `5`.
This triggers their respective `afterSet` methods.

**Reactive Updates with `afterSetA` and `afterSetB`**

The `afterSetA` and `afterSetB` methods react to changes in `a` and `b`, respectively,
by updating the text of the `label1` and `label2` components.

```javascript readonly
    afterSetA(value, oldValue) {
        if (oldValue !== undefined) {
            this.down({flag: 'label1'}).text = value + this.b
        }
    }
    
    afterSetB(value, oldValue) {
        if (oldValue !== undefined) {
            this.down({flag: 'label2'}).text = value + this.a
        }
    }
```

**Important Note on Circular Reference (or Mutual Dependency)**:

As you astutely observed, the logic within `afterSetA() (value + this.b)` and `afterSetB() (value + this.a)` showcases a
mutual dependency. When `this.set({a: X, b: Y})` is called:

// TODO: wrong
Neo.mjs first updates both `this.a` to `X` and `this.b` to `Y` by setting their internal backing properties (`_a` and `_b`).

Then, it triggers `afterSetA` and `afterSetB`. When `afterSetA` executes and accesses `this.b`, it uses the auto-generated
getter for `b`. This getter immediately returns the new value of `b` (which is `Y`) from `this._b`, even though `afterSetB`
might not have been executed yet in the processing queue.

This ensures that all afterSet methods, regardless of their trigger order within a single `set()` operation,
always operate on the most current and consistent state of all config properties involved.

**`changeConfig` Method: Triggering Dynamic Updates**

The `changeConfig` method is called when the "Change configs" button is clicked.

```javascript readonly
    changeConfig(data) {
        this.set({
            a: 10,
            b: 10
        })
    }
```

This demonstrates how an action (button click) can declaratively update config properties,
which then automatically trigger the reactive `afterSet` handlers.

**Calculating Label Texts**

Let's trace the values:

1. **Initial State (After `onConstructed` executes)**:
  * `this.set({a: 5, b: 5})` is called.
  * `this.a` becomes `5` and `this.b` becomes `5` (internally).
  * `afterSetA` is triggered: `this.down({flag: 'label1'}).text = 5 + this.b` (which is `5 + 5 = 10`).
  * `afterSetB` is triggered: `this.down({flag: 'label2'}).text = 5 + this.a` (which is `5 + 5 = 10`).
  * **Initial Label Texts**: `label1`: "10", `label2`: "10"

2. **After Clicking "Change configs" Button**:
  * `this.set({a: 10, b: 10})` is called.
  * `this.a` becomes `10` and `this.b` becomes `10` (internally).
  * `afterSetA` is triggered: `this.down({flag: 'label1'}).text = 10 + this.b` (which is `10 + 10 = 20`).
  * `afterSetB` is triggered: `this.down({flag: 'label2'}).text = 10 + this.a` (which is `10 + 10 = 20`).
  * **Label Texts after clicking "Change configs"**: `label1`: "20", `label2`: "20"

This example vividly demonstrates the dynamic and reactive nature of Neo.mjs's class config system, where changes to
config properties automatically propagate and trigger updates in the UI or other dependent logic.

### 6.1. The Internal Mechanics: set(), processConfigs(), and configSymbol

To fully appreciate how Neo.mjs achieves this powerful and consistent behavior, it's essential to understand the internal
workings of the `set()` and `processConfigs()` methods in `Neo.core.Base`, and how they leverage the `configSymbol` and
auto-generated getters from `autoGenerateGetSet()`.

The core mechanism for managing config values and resolving potential circular dependencies relies on the internal
`configSymbol` and a carefully orchestrated process of assigning and re-assigning values.

**The `set()` Method (`Neo.core.Base`)**

The `set()` method is the public interface for changing one or more config properties at once
[[Source: core.Base.mjs](https://github.com/neomjs/neo/blob/dev/src/core/Base.mjs)].

```javascript readonly
set(values={}) {
    let me = this;
  
    values = me.setFields(values);
  
    // If the initial config processing is still running,
    // finish this one first before dropping new values into the configSymbol.
    if (me[forceAssignConfigs] !== true && Object.keys(me[configSymbol]).length > 0) {
        me.processConfigs()
    }
  
    Object.assign(me[configSymbol], values); // (A)
    me.processConfigs(true) // (B)
}
```

Here's what happens:

* `values = me.setFields(values);`: This first assigns any non-config class fields directly to the instance
  and removes them from the `values` object. This ensures that if an `afterSet` method or `beforeSet` method
  tries to access a non-config field that was part of the same `set()` call, it already has the new value.
* **Pre-processing**: The if condition checks `if` there are pending configs from a previous `initConfig()` call
  (during instance construction) that haven't been fully processed yet. If so, `me.processConfigs()` is called without
  `forceAssign=true` to finish that initial processing. This ensures a clean state before new values are introduced.
* `Object.assign(me[configSymbol], values);` **(A)**: This is a critical step. All new config values passed to `set()`
  are first merged into the `configSymbol` internal object. The configSymbol acts as a temporary holding area for all
  pending config updates. This ensures that even if you set multiple configs (`a` and `b`) in a single `set()` call,
  their values are all available within the `configSymbol` object before any individual setter or `afterSet` hook is called.
* `me.processConfigs(true)` **(B)**: Finally, `processConfigs(true)` is called to actually apply the values from
  `configSymbol` to the instance's properties. The `true` argument for `forceAssign` is crucial here.

**The `processConfigs()` Method (`Neo.core.Base)**

This method iteratively processes the configs stored in `configSymbol`
[[Source: core.Base.mjs](https://github.com/neomjs/neo/blob/dev/src/core/Base.mjs)]:

```javascript readonly
processConfigs(forceAssign=false) {
    let me   = this,
        keys = Object.keys(me[configSymbol]); // Get keys of pending configs
  
    me[forceAssignConfigs] = forceAssign; // Set internal flag
  
    // We do not want to iterate over the keys, since 1 config can remove more than 1 key (beforeSetX, afterSetX)
    if (keys.length > 0) {
        // The hasOwnProperty check is intended for configs without a trailing underscore
        // => they could already have been assigned inside an afterSet-method
        if (forceAssign || !me.hasOwnProperty(keys[0])) { // (C)
            me[keys[0]] = me[configSymbol][keys[0]] // (D)
        }
    
        // there is a delete-call inside the config getter as well (Neo.mjs => autoGenerateGetSet())
        // we need to keep this one for configs, which do not use getters (no trailing underscore)
        delete me[configSymbol][keys[0]]; // (E)
    
        me.processConfigs(forceAssign) // (F) - Recursive call
    }
}
```

Here's the detailed flow and how it handles dependencies:

* **Iteration and `configSymbol`**: `processConfigs` operates by taking the first key from `Object.keys(me[configSymbol])`.
  It doesn't use a traditional loop (`for` or `forEach`) to avoid issues if a setter or `afterSet` hook modifies the
  `configSymbol` itself. Instead, it's a recursive call (`me.processConfigs(forceAssign)`).

* **`forceAssignConfigs` Flag**: The `me[forceAssignConfigs] = forceAssign;` line sets an internal flag.
  This flag is used by the auto-generated setters (from `autoGenerateGetSet` in Neo.mjs) to differentiate between initial
  config processing (where `forceAssign` is `true` after a `set()` call) and subsequent explicit `set` calls within `afterSet` hooks.

* **`hasOwnProperty` Check (C)**: `if (forceAssign || !me.hasOwnProperty(keys[0]))`:
  * If `forceAssign` is `true` (which it is after a `set()` call), the condition is met, and the assignment proceeds.
  * If `forceAssign` is `false` (as during initial `initConfig` calls), it checks `!me.hasOwnProperty(keys[0])`.
    This is important because configs without a trailing underscore (`_`) can be directly assigned, potentially by other
    `afterSet methods`. If a property already exists directly on the instance (meaning its value has already been resolved
    or set), `hasOwnProperty` would be `true`, and the assignment `(D)` is skipped for that config to avoid redundant processing.

* **Assignment (D)**: `me[keys[0]] = me[configSymbol][keys[0]]`:
  * This line triggers the actual setter for the config property (e.g., `setMyConfig`). When the setter executes:
    * It reads the `value` from `me[configSymbol][keys[0]]`.
    * It gets the `oldValue` from the instance's internal `_` property.
    * It updates the internal `_` property with the `value` (the new value).
    * It runs the beforeSet hook (if any), which can modify the value.
    * **Crucially, if a genuine change is detected (`!Neo.isEqual(value, oldValue)`), it then triggers the `afterSet` hook.**

* **Deletion from configSymbol (E)**: `delete me[configSymbol][keys[0]]`: Once a config property's setter has been invoked,
  it's removed from the `configSymbol`. This prevents reprocessing and indicates that this specific config has been handled.

* **Recursive Call (F)**: `me.processConfigs(forceAssign)`: The method calls itself recursively. This ensures that the
  next pending config in `configSymbol` (if any) is processed. The recursion continues until
  `Object.keys(me[configSymbol]).length` is 0, meaning all pending configs have been processed.

**How Dependencies are Handled (Revisiting the MainContainer Example)**

The combination of `configSymbol` as a staging area and the getters generated by `autoGenerateGetSet()` ensures that when
`afterSet` hooks are triggered, they always have access to the most up-to-date values of other configs included
in the same `set()` operation.

Let's re-examine the `onConstructed` example with `a` and `b`:

```javascript readonly
    onConstructed() {
        super.onConstructed();
      
        this.set({
            a: 5,
            b: 5
        })
    }
```

1. **Staging**: When `this.set({a: 5, b: 5}) is called, both `a: 5` and `b: 5` are immediately placed into the `me[configSymbol]` object.
2. **Processing `a` (Example Order)**: `processConfigs` picks `a`. When `me.a = 5` (which triggers `setA` from `autoGenerateGetSet()`) is called:
  * `this._a` is updated to `5`.
  * `afterSetA` is triggered.

3. **Accessing `b` in `afterSetA`**: Inside afterSetA, the expression this.b triggers the getter for b.
  * This getter does not re-process `b` through `processConfigs`. Instead, it simply retrieves the value from `this._b`.
  * Since `this._b` was already updated to `5` when the original `set({a: 5, b: 5})` call initially staged all values,
    the getter for `b` correctly returns `5`.

4. **Result**: `this.down({flag: 'label1'}).text = value + this.b` correctly calculates `5 + 5 = 10`.

5. **Processing `b` (Subsequent)**: Later in the `processConfigs` recursion, `b` will be picked. Its setter will run,
  `this._b` will be updated (to the same value, `5`), and `afterSetB` will be triggered, correctly calculating
  `value + this.a` as `5 + 5 = 10`.

This means that even if `afterSetA` executes before `afterSetB` (or vice-versa), `this.a` and `this.b` will always reflect
their new values from the ongoing `set()` operation. The `configSymbol` acts as a consistent snapshot of all intended
new values for the entire `set()` operation, allowing dependencies to correctly resolve against these pending new values
even before all setters have completed their afterSet calls.

This sophisticated yet transparent mechanism is what makes Neo.mjs's declarative config system so powerful and reliable,
enabling complex inter-config dependencies without concerns about timing or inconsistent data.
