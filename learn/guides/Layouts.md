## Understanding Layouts in Neo.mjs

Layouts are fundamental to arranging components within your application's user interface. In Neo.mjs, layouts are
managed declaratively through the `layout` configuration property of container components. This system provides a
powerful and flexible way to control the positioning, sizing, and alignment of child components.

### How Layouts Work

Every container component (any class extending `Neo.container.Base`) can have a `layout` config. This config defines
how the container's `items` (its child components) are arranged. When you set a `layout` on a container, the framework
automatically handles the positioning and sizing of its children, adapting to different screen sizes and dynamic content.

### The `layout` Config

The `layout` config is an object that typically includes an `ntype` property, specifying the type of layout to use.
Depending on the `ntype`, additional properties can be provided to customize the layout's behavior.

Example:

```javascript
layout: {
    ntype: 'vbox',
    align: 'center'
}
```

### Common Layout Types

Neo.mjs provides several built-in layout types to cover a wide range of UI design needs. Here, we'll explore some of the
most commonly used ones.

#### 1. VBox Layout (`ntype: 'vbox'`)

The VBox (Vertical Box) layout arranges child components in a single vertical column. It's ideal for creating stacked
sections or forms where elements flow from top to bottom.

**Key Properties for VBox Layouts:**

-   `align`: Controls the horizontal alignment of items within the column.
    -   `'left'` (default): Aligns items to the left.
    -   `'center'`: Centers items horizontally.
    -   `'right'`: Aligns items to the right.
    -   `'stretch'`: Stretches items to fill the available width of the container.

-   `pack`: Controls how items are packed along the vertical axis (main axis).
    -   `'start'` (default): Items are packed towards the top.
    -   `'center'`: Items are centered vertically.
    -   `'end'`: Items are packed towards the bottom.
    -   `'space-between'`: Items are evenly distributed with space between them.
    -   `'space-around'`: Items are evenly distributed with space around them (including half-space at ends).

-   `flex`: A property applied to individual child items, not the layout itself. It determines how an item grows or
    shrinks to fill available space within the VBox. A `flex` value of `1` means the item will expand to fill remaining
    space.

**Example:**

```javascript live-preview
import Container from '../container/Base.mjs';
import Button from '../button/Base.mjs';

class VBoxExample extends Container {
    static config = {
        className: 'Example.view.VBoxExample',
        layout: {
            ntype: 'vbox',
            align: 'center', // Center items horizontally
            pack: 'center'   // Center items vertically
        },
        items: [{
            module: Button,
            text: 'Button 1',
            width: 100
        }, {
            module: Button,
            text: 'Button 2',
            width: 150
        }, {
            module: Button,
            text: 'Button 3',
            flex: 1 // This button will expand to fill remaining vertical space
        }]
    }
}

Neo.setupClass(VBoxExample);
```

#### 2. HBox Layout (`ntype: 'hbox'`)

The HBox (Horizontal Box) layout arranges child components in a single horizontal row. It's commonly used for toolbars,
navigation menus, or any scenario where elements need to be displayed side-by-side.

**Key Properties for HBox Layouts:**

-   `align`: Controls the vertical alignment of items within the row.
    -   `'top'` (default): Aligns items to the top.
    -   `'center'`: Centers items vertically.
    -   `'bottom'`: Aligns items to the bottom.
    -   `'stretch'`: Stretches items to fill the available height of the container.

-   `pack`: Controls how items are packed along the horizontal axis (main axis).
    -   `'start'` (default): Items are packed towards the left.
    -   `'center'`: Items are centered horizontally.
    -   `'end'`: Items are packed towards the right.
    -   `'space-between'`: Items are evenly distributed with space between them.
    -   `'space-around'`: Items are evenly distributed with space around them (including half-space at ends).

-   `flex`: Similar to VBox, `flex` applied to individual child items determines how they grow or shrink to fill
    available horizontal space within the HBox.

**Example:**

```javascript live-preview
import Container from '../container/Base.mjs';
import Button from '../button/Base.mjs';

class HBoxExample extends Container {
    static config = {
        className: 'Example.view.HBoxExample',
        layout: {
            ntype: 'hbox',
            align: 'center', // Center items vertically
            pack: 'start'    // Pack items to the left
        },
        items: [{
            module: Button,
            text: 'Button A',
            height: 50
        }, {
            module: Button,
            text: 'Button B',
            height: 70
        }, {
            module: Button,
            text: 'Button C',
            flex: 1 // This button will expand to fill remaining horizontal space
        }]
    }
}

Neo.setupClass(HBoxExample);
```

This is just the beginning of understanding layouts in Neo.mjs. In subsequent sections, we will explore more advanced
layout types and concepts like nesting layouts for complex UI structures.