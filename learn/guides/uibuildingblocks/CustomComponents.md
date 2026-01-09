# Custom Components

## Introduction

A major strength of Neo.mjs is its extensive library of components. In most cases, you can build sophisticated
user interfaces simply by creating configuration objects for these existing components and adding them to a container's
`items` array. This configuration-driven approach is a significant departure from frameworks like Angular, React, or
Vue, where creating custom components is a core part of the development workflow.

However, there are times when you need to create something truly unique or encapsulate a specific set of configurations
and logic for reuse. In these scenarios, creating a custom component by extending a framework class is the perfect
solution.

This guide will walk you through the process.

## Choosing the Right Base Class

In the world of React, developers often use Higher-Order Components (HOCs) to reuse component logic. In Neo.mjs, you
achieve a similar result through class extension. The key to creating a robust and efficient custom component is
choosing the correct base class to extend.

Instead of extending the most generic `Neo.component.Base` class, look for a more specialized class that already
provides the functionality you need.

-   If your component needs to contain other components, extend `Neo.container.Base`.
-   If you're creating an interactive element, extending `Neo.button.Base` gives you focus and keyboard support.
-   If you need a custom form field, look for a suitable class within `Neo.form.field`.

By choosing the most specific base class, you inherit a rich set of features, saving you from having to reinvent the
wheel and ensuring your component integrates smoothly into the engine.

## Real-World Examples inside the Neo.mjs Component Library

The Neo.mjs engine itself uses this principle of extending the most specific class. Let's look at a couple of
examples from the engine's source code.

### Toolbar Inheritance

-   **`Neo.toolbar.Base`** extends `Neo.container.Base`.
    It's the foundational toolbar and extends `Container` because its main purpose is to hold other components. It adds
    features like docking.

-   **`Neo.tab.header.Toolbar`** extends `Neo.toolbar.Base`.
    This is a specialized toolbar for tab headers. It inherits the ability to hold items and be docked, and adds new
    logic for managing the active tab indicator.

-   **`Neo.grid.header.Toolbar`** extends `Neo.toolbar.Base`.
    This toolbar is for grid headers. It also inherits from `toolbar.Base` and adds grid-specific features like column
    resizing and reordering.

### Button Inheritance

-   **`Neo.button.Base`** extends `Neo.component.Base`.
    This is the basic button, providing core features like click handling and icon support.

-   **`Neo.tab.header.Button`** extends `Neo.button.Base`.
    A button used in tab headers. It inherits all the standard button features and adds a visual indicator for the
    active tab.

-   **`Neo.grid.header.Button`** extends `Neo.button.Base`.
    A button for grid column headers. It inherits from the base button and adds features for sorting and filtering the
    grid data.

These examples show how building on top of specialized base classes leads to a clean, maintainable, and powerful
component architecture.

## The Role of `Neo.setupClass()` and the Global `Neo` Namespace

When you define a class in Neo.mjs and pass it to `Neo.setupClass()`, the engine does more than just process its configurations and apply mixins. A crucial step performed by `Neo.setupClass()` is to **enhance the global `Neo` namespace** with a reference to your newly defined class.

This means that after `Neo.setupClass(MyClass)` is executed, your class becomes accessible globally via `Neo.[your.class.name]`, where `[your.class.name]` corresponds to the `className` config you defined (e.g., `Neo.button.Base`, `Neo.form.field.Text`).

**Implications for Class Extension and Usage:**

*   **Global Accessibility**: You can refer to any core class (or your own custom classes after they've been set up) using their full `Neo` namespace path (e.g., `Neo.button.Base`, `Neo.container.Base`) anywhere in your application code, even without an explicit ES module import for that specific class.
*   **Convenience vs. Best Practice**: While `extends Neo.button.Base` might technically work without an `import Button from '...'`, it is generally **not recommended** for application code. Explicit ES module imports (e.g., `import Button from '../button/Base.mjs';`) are preferred because they:
    *   **Improve Readability**: Clearly show the dependencies of your module.
    *   **Enhance Tooling**: Enable better static analysis, auto-completion, and refactoring support in modern IDEs.
    *   **Ensure Consistency**: Promote a consistent and predictable coding style.
*   **Framework Internal Use**: The global `Neo` namespace is heavily utilized internally by the engine itself for its class registry, dependency resolution, and dynamic instantiation (e.g., when using `ntype` or `module` configs).

Understanding this mechanism clarifies how Neo.mjs manages its class system and provides the underlying flexibility for its configuration-driven approach.

## Overriding Ancestor Configs

The simplest way to create a custom component is to extend an existing one and override some of its default
configuration values.

Every class in Neo.mjs has a `static config` block where its properties are defined. When you extend a class, you can
define your own `static config` block and set new default values for any property inherited from an ancestor class.

In the example below, we create `MySpecialButton` by extending `Neo.button.Base`. We then override the `iconCls` and
`ui` configs to create a button with a specific look and feel.

## Introducing New Configs

You can also add entirely new configuration properties to your custom components. To make a config "reactive" – meaning
it automatically triggers a lifecycle method when its value changes – you **must** define it with a trailing underscore (`_`).

For a reactive config like `myConfig_`, the framework provides this behavior:
- **Reading**: You can access the value directly: `this.myConfig`.
- **Writing**: Assigning a new value (`this.myConfig = 'new value'`) triggers a prototype-based setter. This is the core of Neo.mjs reactivity.
- **Hooks**: The framework provides three optional hooks for each reactive config: `beforeGet`, `beforeSet`, and `afterSet`. After a value is set, the `afterSetMyConfig(value, oldValue)` method is automatically called.

If you define a config without the trailing underscore, it will simply be a static property on the class instance and will not trigger any lifecycle methods.

For a complete explanation of the config system, including details on all the lifecycle hooks, please see the [Unified Config System guide](benefits.ConfigSystem).

## Example: A Custom Button

Let's look at a practical example. Here, we'll create a custom button that combines the standard `text` config with a new
`specialText_` config to create a dynamic label.

```javascript live-preview
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

// 1. Define our custom component by extending a core class.
class MySpecialButton extends Button {
    static config = {
        className: 'Example.view.MySpecialButton',

        // a. Override configs from the parent class
        iconCls: 'far fa-face-grin-wide',
        ui     : 'ghost',

        // b. Add a new reactive config (note the trailing underscore)
        specialText_: 'I am special'
    }

    // c. Hook into the component lifecycle
    afterSetSpecialText(value, oldValue) {
        this.updateButtonText()
    }

    afterSetText(value, oldValue) {
        this.updateButtonText()
    }

    // d. A custom method to update the button's text
    updateButtonText() {
        const {specialText, text} = this;
        let fullText = `${text} (${specialText})`;

        // Directly manipulate the VDom text node and update the component
        this.textNode.text = fullText;
        this.update();
    }
}

MySpecialButton = Neo.setupClass(MySpecialButton);


// 2. Use the new component in a view.
class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            // A standard engine button for comparison
            module : Button,
            iconCls: 'fa fa-home',
            text   : 'A core button'
        }, {
            // Our new custom button
            module     : MySpecialButton,
            text       : 'My button',
            specialText: 'is very special'
        }]
    }
}

MainView = Neo.setupClass(MainView);
```

### Breakdown of the Example:

1.  **Class Definition**: We define `MySpecialButton` which `extends` the engine's `Button` class.
2.  **New Reactive Config**: We add a `specialText_` config. The trailing underscore makes it reactive.
3.  **Lifecycle Methods**: We implement `afterSetSpecialText()` and override `afterSetText()` to call our custom
    `updateButtonText()` method. Because `afterSet` hooks are called for initial values upon instantiation, this
    ensures the button text is correct from the start and stays in sync.
4.  **Custom Method**: The `updateButtonText()` method combines the `text` and `specialText` configs and updates the
    `text` property of the button's `textNode` in the VDOM.
5.  **`this.update()`**: After changing the VDOM, we call `this.update()` to make the engine apply our changes to the
    real DOM.

This example shows how you can create a component that encapsulates its own logic and provides a richer, more dynamic
behavior than a standard component.

## Extending `Component.Base`: Building VDom from Scratch

While extending specialized components like `Button` or `Container` is common for adding features (acting like a
Higher-Order Component), there are times when you need to define a component's HTML structure from the ground up. For
this, you extend the generic `Neo.component.Base`.

When you extend `component.Base`, you are responsible for defining the component's entire virtual DOM (VDom) structure
using the `vdom` config. This gives you complete control over the rendered output.

### Example: A Simple Profile Badge

Let's create a `ProfileBadge` component that displays a user's name and an online status indicator.

```javascript live-preview
import Component from '../component/Base.mjs';
import Container from '../container/Base.mjs';
import NeoArray  from '../util/Array.mjs';
import VdomUtil  from '../util/Vdom.mjs';

// 1. Extend the generic Component.Base
class ProfileBadge extends Component {
    static config = {
        className: 'Example.view.ProfileBadge',
        ntype    : 'profile-badge',

        // a. Define the VDom from scratch
        vdom: {
            cls: ['profile-badge'],
            cn : [
                {tag: 'span', cls: ['status-indicator'], flag: 'statusNode'},
                {tag: 'span', cls: ['username'],         flag: 'usernameNode'}
            ]
        },

        // b. Add new reactive configs to control the component (note the trailing underscore)
        online_  : false,
        username_: 'Guest'
    }

    // d. Define getters for easy access to flagged VDom nodes
    get statusNode() {
        return VdomUtil.getByFlag(this.vdom, 'statusNode')
    }

    get usernameNode() {
        return VdomUtil.getByFlag(this.vdom, 'usernameNode')
    }

    // c. Use lifecycle methods to react to config changes
    afterSetOnline(value, oldValue) {
        // Access the VDom node via the getter
        NeoArray.toggle(this.statusNode.cls, 'online', value);
        this.update() // Trigger a VDom update
    }

    afterSetUsername(value, oldValue) {
        this.usernameNode.text = value;
        this.update()
    }
}

ProfileBadge = Neo.setupClass(ProfileBadge);


// 2. Use the new component
class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module  : ProfileBadge,
            username: 'Alice',
            online  : true
        }, {
            module  : ProfileBadge,
            username: 'Bob',
            online  : false,
            style   : {marginTop: '10px'}
        }]
    }
}

MainView= Neo.setupClass(MainView);
```

### Key Differences in this Approach:

1.  **Base Class**: We extend `Neo.component.Base` because we are not inheriting complex logic like a `Button` or
    `Container`.
2.  **`vdom` Config**: We define the entire HTML structure inside the `vdom` config. We use `flag`s (`statusNode`,
    `usernameNode`) to easily reference these VDom nodes later.
3.  **Lifecycle Methods**: We use `afterSet...` methods to react to changes in our custom `online_` and `username_`
    configs. Inside these methods, we directly manipulate the properties of our VDom nodes and then call `this.update()`
    to apply the changes to the real DOM.

This approach gives you maximum control, but it also means you are responsible for building the structure yourself.

For a deeper dive into advanced VDom manipulation, including performance best practices and security, please refer to the
[Working with VDom guide](guides.WorkingWithVDom).
