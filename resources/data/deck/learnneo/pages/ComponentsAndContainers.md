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
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.components1.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            ntype : 'component', // Or module:Component
            style : {border: 'thin solid red;'}, // Styling is usually done via "cls"
            height: 100,
            width : 200
        }]
    }
}

MainView = Neo.setupClass(MainView);
</pre>

Components also have an `html`. The `html` property is rarely used, and goes against the abstract philosophy of Neo.mjs, but
sometimes it's handy as a placeholder as you stub out views.

<pre data-neo>
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.components2.MainView',
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

MainView = Neo.setupClass(MainView);
</pre>


## Layout

The `layout` config specifies how components are arranged within a container. Here are examples of 
some commonly-used layouts.

### Fit layout

Fix is used when there's a single child. The component is sized to fit the container.

<pre data-neo>
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.components3.MainView',
        layout   : 'fit', // If no configs are needed, simply use the ntype of the layout
        items    : [{
            ntype: 'component',
            style: {backgroundColor: 'lightgreen'}, // The camel-cased backgroundColor property converts to the hyphenated css style
        }]
    }
}

MainView = Neo.setupClass(MainView);
</pre>

### Vbox and hbox

With `vbox` and `hbox`, items are arranged vertically or horizontally.

<pre data-neo>
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.components4.MainView',
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

MainView = Neo.setupClass(MainView);
</pre>

### Card

A card container has multiple child items, one of which is visible. 

<pre data-neo>
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.components5.MainView',
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
                    container.layout.activeIndex = (container.layout.activeIndex + 1) % container.items.length;
                }
            }]
        }, {
            ntype: 'container',
            reference: 'cardContainer',
            layout: 'card',
            flex: 1,
            items: [{
                ntype : 'component',
                style: {backgroundColor: 'lightsalmon'} // https://drafts.csswg.org/css-color/#named-colors
            }, {
                ntype : 'component',
                style: {backgroundColor: 'darkseagreen'} // Who came up with these names?
            }, {
                ntype : 'component',
                style: {backgroundColor: 'cornflowerblue'} 
            }]
        }]
    }
}

MainView = Neo.setupClass(MainView);
</pre>




## Reusing components

Neo.mjs is class-based, and thus, any component or container can be defined as its own class, and reused like any
other component in the framework.

<pre data-neo>
import Button from '../button/Base.mjs';
// In practice this would be some handy reusable component
class MySpecialButton extends Button {
    static config = {
        className: 'Example.view.MySpecialButton',
        iconCls: 'far fa-face-grin-wide',
        ui: 'ghost'
    }
}

MySpecialButton = Neo.setupClass(MySpecialButton);


import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.components6.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module : Button,
            iconCls: 'fa fa-home',
            text   : 'A framework button'
        }, {
            module : MySpecialButton,
            text   : 'My special button'
        }]
    }
}

MainView = Neo.setupClass(MainView);
</pre>

