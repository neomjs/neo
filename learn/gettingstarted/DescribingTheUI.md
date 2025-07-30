# Describing a View

A Neo.mjs view is comprised of components and containers. A component is a visual widget, like a button,
and a container is a visual collection of components.

Neo.mjs is declarative, where your code _describes_ or _configures_ the things it's creating.

There are two primary ways to describe a view: using modern **functional components** or classic **class-based components**.
Crucially, these two approaches are fully interoperable, allowing you to mix and match them to fit your needs.

## The Modern Approach: Functional Components

For most new views, especially those that are primarily presentational (like a button or a hero section), the recommended approach is to use functional components. This method is concise, highly performant, and aligns with modern reactive programming patterns.

Functional components are defined using the `defineComponent` helper. You provide a configuration object that includes a `createVdom` method. This method is a reactive function that returns the Virtual DOM (VDOM) for your component.

### A simple functional view

Here is a simple view that displays a single button. The `createVdom` function returns a VDOM object that describes the button.

```javascript live-preview
import {defineComponent} from '../functional/_export.mjs';

const MainView = defineComponent({
    className: 'GS.describing.functional.MainView',

    createVdom(config) {
        return {
            ntype: 'container',
            layout: {ntype: 'vbox', align: 'start'},
            items: [{
                ntype: 'button',
                iconCls: 'fa fa-home',
                text: 'Home'
            }]
        }
    }
});

export default MainView;
```

## The Classic Approach: Class-Based Components

For more complex, high-order components that require surgical precision and powerful state management (like a buffered grid, a calendar, or an image gallery), the classic class-based approach is more suitable.

This approach involves extending a framework class (like `Neo.container.Base`) and defining your view within the `static config` block. It gives you access to a rich set of lifecycle methods (`beforeSet...`, `afterSet...`, etc.) for fine-grained control.

### A simple class-based view

Here is the same view, but built with the class-based approach.

```javascript live-preview
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'GS.describing.class.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module : Button,
            iconCls: 'fa fa-home',
            text   : 'Home'
        }]
    }
}

MainView = Neo.setupClass(MainView);
```

## Interoperability: The Best of Both Worlds

The power of Neo.mjs lies in its interoperability layer. You can seamlessly mix both component models.

### Using a Class-Based Component in a Functional View

You can easily instantiate a classic component within the `createVdom` method of a functional component. This is useful when you need to embed a complex, stateful widget inside a simpler, functional layout.

```javascript live-preview
import {defineComponent} from '../functional/_export.mjs';
import Calendar from '../calendar/Component.mjs'; // A complex, class-based component

const MainView = defineComponent({
    className: 'GS.describing.interop.MainView1',

    createVdom(config) {
        return {
            ntype: 'container',
            layout: {ntype: 'vbox', align: 'start'},
            items: [{
                ntype: 'component',
                vdom: {tag: 'h1', html: 'My Functional View'}
            }, {
                // Drop the class-based Calendar into our functional view
                module: Calendar,
                height: 300,
                width: 300
            }]
        }
    }
});

export default MainView;
```

### Using a Functional Component in a Class-Based View

Conversely, you can drop a functional component into the `items` array of a classic container. This allows you to compose your complex views from smaller, more manageable functional pieces.

```javascript live-preview
import {defineComponent} from '../functional/_export.mjs';
import Container from '../container/Base.mjs';

// 1. Define a simple functional component
const MyFunctionalButton = defineComponent({
    className: 'GS.describing.interop.FuncButton',
    createVdom(config) {
        return {
            ntype: 'button',
            iconCls: config.iconCls,
            text: config.text
        }
    }
});

// 2. Create a class-based MainView
class MainView extends Container {
    static config = {
        className: 'GS.describing.interop.MainView2',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            // 3. Use the functional component in the items array
            module: MyFunctionalButton,
            iconCls: 'fa fa-rocket',
            text   : 'Launch'
        }]
    }
}

MainView = Neo.setupClass(MainView);
```

## Choosing Your Approach

*   **Use Functional Components (`defineComponent`) for:**
    *   Simple, reusable components (e.g., buttons, chips, hero sections).
    *   Most of your application's views that are primarily presentational.
    *   When you want a concise, declarative, and highly performant component.

*   **Use Class-Based Components (`class ... extends ...`) for:**
    *   Complex, high-order components requiring surgical precision (e.g., buffered grids, calendars, charts, galleries).
    *   Creating new reusable components that extend the functionality of existing framework classes.
    *   Components with intricate internal logic that benefits from the full range of class lifecycle methods.
