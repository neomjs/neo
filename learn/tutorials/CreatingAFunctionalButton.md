# Creating a Custom Functional Button

In the "Describing a View" guide, you learned the basics of functional and class-based components. Now, let's dive
deeper into the modern approach by creating our own custom, reusable functional button.

**Note:** Neo.mjs already provides a powerful, feature-rich functional button (`Neo.functional.button.Base`). The purpose
of this guide is not to replace it, but to use a button as a simple, practical example to teach you the fundamentals of
creating your own functional components.

This guide will walk you through the process of building a `MyCoolButton` component that has its own unique style and
behavior, using the `defineComponent` helper.

## 1. Defining the Component

First, let's create the basic structure of our component. We'll use `defineComponent` and provide a `className`
and a `createVdom` method.

```javascript readonly
import {defineComponent} from '../../src/functional/_export.mjs';

export default defineComponent({
    config: {
        className: 'MyCoolButton'
    },

    createVdom(config) {
        // We will build our VDOM here
        return {
            tag : 'button',
            cls : ['my-cool-button'],
            text: 'Click Me'
        }
    }
});
```

## 2. Adding Custom Configs

A component isn't very reusable without configs. Let's add `text_` and `iconCls_` to our component's public API.
Remember, the trailing underscore `_` makes the config reactive.

We'll also update `createVdom` to use these configs. The `config` parameter of `createVdom` is a reactive proxy to the
component's instance, so we can access our configs directly from it.

```javascript readonly
import {defineComponent} from '../../src/functional/_export.mjs';

export default defineComponent({
    // 1. Define the public API
    config: {
        className: 'MyCoolButton',
        iconCls_ : null,
        text_    : 'Default Text'
    },
    // 2. Use the configs in createVdom
    createVdom(config) {
        const {iconCls, text} = config;

        return {
            tag: 'button',
            cls: ['my-cool-button'],
            cn : [{
                tag      : 'span',
                cls      : ['fa', iconCls],
                removeDom: !iconCls // Don't render the span if no iconCls is provided
            }, {
                tag: 'span',
                cls: ['my-cool-button-text'],
                text
            }]
        }
    }
});
```

## 3. Handling User Events

Static buttons are boring. Let's make it interactive. We can add a `handler_` config and an `onClick` method to our
component. The `addDomListeners` method in the `construct` hook allows us to listen for native DOM events.

```javascript readonly
import {defineComponent} from '../../src/functional/_export.mjs';

export default defineComponent({
    config: {
        className   : 'MyCoolButton',
        domListeners: [{click: 'onClick'}],
        handler_    : null, // A function to call on click
        iconCls_    : null,
        text_       : 'Default Text'
    },

    createVdom(config) {
        // ... (same as before)
    },

    onClick(data) {
        // If a handler function is provided, call it.
        this.handler?.(this);
    }
});
```

## 4. Using Your Custom Component

Now you can use `MyCoolButton` just like any other Neo.mjs component, either in a functional or a class-based view.

```javascript live-preview
import {defineComponent} from '../functional/_export.mjs';
import Container         from '../container/Base.mjs';

// 1. Define our custom button
const MyCoolButton = defineComponent({
    config: {
        className   : 'MyCoolButton',
        domListeners: [{click: 'onClick'}],
        handler_    : null,
        iconCls_    : null,
        text_       : 'Default Text',
    },
    createVdom(config) {
        const {iconCls, text} = config;
        return {
            tag: 'button',
            cls: ['my-cool-button'],
            cn : [
                {tag: 'span', cls: ['fa', iconCls], removeDom: !iconCls},
                {tag: 'span', cls: ['my-cool-button-text'], text}
            ]
        }
    },
    onClick(data) {
        this.handler?.(this);
    }
});

// 2. Use it in a MainView
class MainView extends Container {
    static config = {
        className: 'GS.guides.CustomButtonMainView',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module : MyCoolButton,
            iconCls: 'fa-star',
            text   : 'My Button!',
            handler(button) {
                Neo.Main.log({value: `Button clicked: ${button.id}`});
                button.text = 'Clicked!'; // It's reactive!
            }
        }]
    }
}

MainView = Neo.setupClass(MainView);
```

This example demonstrates the full power of the functional component model. You can quickly create reusable, reactive,
and encapsulated components with a clean and modern API. From here, you could add more configs, more complex VDOM logic,
or even internal state using the `useConfig` hook to build even more powerful components.
