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
wheel and ensuring your component integrates smoothly into the framework.

## Real-World Examples inside the Neo.mjs Component Library

The Neo.mjs framework itself uses this principle of extending the most specific class. Let's look at a couple of
examples from the framework's source code.

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

## Overriding Ancestor Configs

The simplest way to create a custom component is to extend an existing one and override some of its default
configuration values.

Every class in Neo.mjs has a `static config` block where its properties are defined. When you extend a class, you can
define your own `static config` block and set new default values for any property inherited from an ancestor class.

In the example below, we create `MySpecialButton` by extending `Neo.button.Base`. We then override the `iconCls` and
`ui` configs to create a button with a specific look and feel.

## Introducing New Configs

You can also add entirely new configuration properties to your custom components. Simply add them to the `static config`
block with a default value. Neo.mjs will automatically generate a getter and a setter for your new config, and you can
use it to control the behavior of your component.

For example, if we wanted our `MySpecialButton` to have a `specialEffect` config, we could add
`specialEffect: 'glow'` to its config block.

## Example: A Custom Button

Let's look at a practical example. Here, we'll create a custom button and then use it within a container.

```javascript live-preview
import Button from '../button/Base.mjs';
import Container from '../container/Base.mjs';

// 1. Define our custom component by extending a framework class.
// In practice, this would be a reusable component in your application's view folder.
class MySpecialButton extends Button {
    static config = {
        // a. Always define a unique className
        className: 'Example.view.MySpecialButton',

        // b. Override configs from the parent class (Button)
        iconCls: 'far fa-face-grin-wide',
        ui: 'ghost',

        // c. Add a new custom config
        specialText: 'I am special'
    }

    // d. Hook into the component lifecycle
    onConstructed() {
        // Call the superclass method first
        super.onConstructed();

        // Access our new config property
        console.log(this.specialText);
    }
}

// 2. Register the class with the framework.
// This is only needed inside the live-preview environment.
// In a real app, the build process handles this automatically.
MySpecialButton = Neo.setupClass(MySpecialButton);


// 3. Use the new component in a view.
class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout: {ntype: 'vbox', align: 'start'},
        items: [{
            // A standard framework button for comparison
            module: Button,
            iconCls: 'fa fa-home',
            text: 'A framework button'
        }, {
            // Our new custom button
            module: MySpecialButton,
            text: 'My special button'
        }]
    }
}

Neo.setupClass(MainView);
```

### Breakdown of the Example:

1.  **Class Definition**: We define `MySpecialButton` which `extends` the framework's `Button` class.
2.  **`className`**: We give our new class a unique `className`. This is important for the framework's class system.
3.  **Overridden Configs**: We change the default `iconCls` and `ui` to style our button differently.
4.  **New Config**: We add a `specialText` config. While this example doesn't use it to change the button's
    appearance, the `onConstructed` method shows how you can access its value.
5.  **Lifecycle Method**: We use `onConstructed`, which fires after the component is created, to log the value of our
    new config. We call `super.onConstructed()` to ensure the parent class's logic is executed.
6.  **Usage**: We use `MySpecialButton` in the `items` array of our `MainView` just like any other component, by
    referencing its `module`.
