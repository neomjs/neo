A Neo.mjs view is comprised of components and containers. A component is a visual widget, like a button,
and a container is a visual collection of components. 

Neo.mjs is declarative, where your code _describes_ or _configures_ the things its creating. 

For example, if you wanted to create a button, you'd look in the API docs and see that buttons
have a few key configs, including `text` and `iconCls`. The configs are properties you can 
use to describe the component you're creating> You can also access or set the properties dynamically.


## A view with one component

<pre data-neo>
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module : Button,
            iconCls: 'fa fa-home',
            text   : 'Home'
        }]
    }
}

Neo.setupClass(MainView);
</pre>


The button config is just an object describing the button being created. In the example, it has three
properties:

- `module` is the type of thing being created; it's the imported module name.
- `text` is the button's text
- `iconCls` is the css class used for the button's icon. Neo.mjs automatically includes Font Awesome, 
and `fa fa-home` matches a Font Awesome css class.

Components are almost always placed within a container. A container is a component that visually holds other 
components. Containers have an `items:[]` config, which is an array of the components within the container. 
Containers also have a `layout` property, which describes how the items are arranged. 

Let's put a second button in the container.

## A view with two components

<pre data-neo>
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

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

If you run the example you'll see two buttons, arranged according to the `layout`. If you'd like, 
modify the code to specify `ntype:'hbox'` and run it again. 

Note that the layout specifies `ntype` rather than `module`. An `ntype` is an alias for a class
that has already been imported. Containers import all the layout types, so since we've already
imported container we can simply use `ntype` to specify which layout we want.
