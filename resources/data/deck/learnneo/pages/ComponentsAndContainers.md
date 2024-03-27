Neo.mjs views are made up of components and containers. 

A component is a visual widget, such as a button, label, or text field. A container is a visual 
collection of components.

`Neo.component.Base` is the base class for all components. It introduces some common features, such as
event handling, binding, and some life-cycle methods.

`Neo.container.Base` is the base class for all containers. Containers are also components.

## Neo.container.Base

Containers are commonly used, although there are many specialized sub-classes, such as panels and toolbars.


Containers have two key properties: 

- `items`, which are the components within the container, and 
- `layout`, which describes how the items are arranged

## Neo.component.Base

The component base class introduces common component features, but is rarely used itself because it's so
primitive. Components introduce various properties, such as `width`, `height`, `cls` (to specify CSS classes for the component).

Here's a container, with one child item.

<pre data-neo>
import Container from '../../../../src/container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            ntype : 'component', // Or module:Component
            style : {border: 'thin solid red;'}, // Styling is usually done via "cls"
            height: 100,
            width : 200
        }]
    }
}

Neo.setupClass(MainView);
</pre>

Components also have an `html`. The `html` property is rarely used, and goes against the abstract philosophy of Neo.mjs, but
sometimes it's handy as a placeholder as you stub out views.

<pre data-neo>
import Container from '../../../../src/container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            ntype : 'component', // Or module:Component
            style : {border: 'thin solid red;'}, // Styling is usually done via "cls"
            html  : 'This is a placeholder for a more sophisticated component we\'ll add later.',
            height: 100,
            width : 200
        }]
    }
}

Neo.setupClass(MainView);
</pre>


## Layout

The `layout` config specifies how components are arranged within a container. Here are examples of 
some commonly-used layouts.

### Fit layout

Fix is used when there's a single child. The component is sized to fit the container.

<pre data-neo>
import Container from '../../../../src/container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : 'fit', // If no configs are needed, simply use the ntype of the layout
        items    : [{
            ntype: 'component',
            style: {backgroundColor: 'lightgreen'}, // The camel-cased property converts to the hyphenated css style
        }]
    }
}

Neo.setupClass(MainView);
</pre>

### Vbox and hbox

Items are arranged vertically or horizontally. On-axis and off-axis alignment can be specified.

<pre data-neo>
import Button    from '../../../../src/button/Base.mjs';
import Container from '../../../../src/container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'}, // Change the ntype to 'hbox'
        items    : [{
            module : Button,
            iconCls: 'fa fa-home',
            text   : 'Home'
        }, {
            module : Button,
            iconCls: 'fa fa-star',
            text   : 'Star'
        }]
    }
}

Neo.setupClass(MainView);
</pre>

### Card

Having multiple child items, one of which is visible. 

<pre data-neo>
import Button    from '../../../../src/button/Base.mjs';
import Base from '../../../../src/container/Base.mjs';

class MainView extends Base {
    static config = {
        className: 'Example.view.MainView',
        layout   : 'vbox',
        items    : [{
            ntype: 'toolbar',
            dock : 'top',
            items: [{
                ntype: 'button',
                text: 'Click me to cycle through the cards',
                ui: 'ghost',
                iconCls: 'fa fa-chevron-right',
                iconPosition: 'right',
                handler: data => {
                    const container = data.component.up('container').getReference('cardContainer');
                    container.layout.activeIndex = (container.layout.activeIndex +1) % container.items.length;
                }
            }]
        }, {
            ntype: 'container',
            reference: 'cardContainer',
            layout: 'card',
            flex: 1,
            items: [{
                ntype : 'component',
                style: {backgroundColor: 'lightsalmon'}, // The camel-cased property converts to the hyphated css style
            }, {
                ntype : 'component',
                style: {backgroundColor: 'darkseagreen'} // https://drafts.csswg.org/css-color/#named-colors
            }, {
                ntype : 'component',
                style: {backgroundColor: 'cornflowerblue'} // Who came up with these names?
            }]
        }]
    }
}

Neo.setupClass(MainView);
</pre>




## Reusing containers


## Lifecycle methods
