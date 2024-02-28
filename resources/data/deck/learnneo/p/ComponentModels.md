Neo has a feature that allows shared, bindable, data.

A _view model_ &mdash; `Neo.model.Component` &mdash; instance holds properties that 
can be bound to component properties.

<pre data-neo>
import Container from  '../../../../src/container/Base.mjs';
import Label     from  '../../../../src/component/Label.mjs';
import TextField from  '../../../../src/form/field/Text.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',

        model: {
            data: {
                foo: 'Hi there!'
            }
        },
        layout: 'vbox',
        items: [{
            module: Label,
            bind: {
                text: data => `The value of foo is "${data.foo}"`   // The "text" property is set as data.foo changes
            }
        }, {
            module: TextField,
            bind: {
                value: {twoWay: true, value: data => data.foo}      // "twoWay" means data.foo is set as the text field changes
            },
            labelText: 'Bound to foo:',
            width: 300
        }],
        style: {padding: '1em'}
    }
}
Neo.setupClass(MainView);
</pre>

View model properties are visible down the containment hierarchy:
Properties introduced in a parent container will be available to any child component, and properties
introduces in a specific component are only visible to that component. This approach makes it easy to control scope.

In the example above, the main view has a view model that defined a property _foo_. A view model property is available
within the view and its children. The child items &mdash; a label and a text field &mdash; can bind properties to
_foo_. As _foo_ changes, the properties are automatically updated. The example also shows that a binding can be
`twoWay`, which means a change to the property in the view is _pushed_ to the view model. 

<img width="50%" src="https://s3.amazonaws.com/mjs.neo.learning.images/gettingStarted/vm/VisualHierarchy.png"></img>

(Note that in the example above, the main view's view model is defined in-line. Normally your view model 
would be  coded in its own class that extends 'Neo.model.Component', and you'd use that in your component.
Just like with items component configs, trivial configs may be done in-line, and non-trivial configs are 
usually coded as separate classes.)

Below is another example.

<pre data-neo>
import Container from  '../../../../src/container/Base.mjs';
import Label     from  '../../../../src/component/Label.mjs';
import Panel     from  '../../../../src/container/Panel.mjs';

class MyPanel extends Panel {
    static config = {
        className: 'Example.view.MyPanel',
        headers: [{
            dock : 'top',
            items: [{ module: Label, text: 'MyPanel' }]
        }],
        items: [{ 
            module: Label, 
            bind: {
                text: data => `The value of foo is "${data.foo}"` 
            },
            style: {margin: '1em'}
        }],
        style: {margin: '1em'}
    }
}
Neo.setupClass(MyPanel);

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',

        model: {
            data: {
                foo: 'parent'
            }
        },
        layout: 'hbox',
        items: [{
            module: MyPanel
        }, {
            module: MyPanel
        }, {
            module: MyPanel,
            // You wouldn't normally configure a view model. We're doing it here to illustrate view model scope.
            model: {
                data: {
                    foo: 'child'
                }
            }
        }],
        style: {margin: '1em'}
    }
}
Neo.setupClass(MainView);
</pre>

In this case, the main view has three child items of type `MyPanel`, each containing a label. 
The main view has a view model with a `foo` property, and the third child has its own view model with a `foo` property.

<img width="60%" src="https://s3.amazonaws.com/mjs.neo.learning.images/gettingStarted/vm/VisualHierarchyFooShadowed.png"></img>

`MyPanel` contains a `Neo.componnet.Label` whose `text` value is bound to `foo`. To resolve the binding, 
Neo.mjs looks up the containment hierarchy until it finds the value. For the first two panels the label 
binding looks in the label, then in its `MyPanel` container, then in the main view &mdash; where it finds `foo`. 

For the third child panel the label binding looks in the label, then in its `MyPanel`, but this time it finds it
because the third copy of `MyPanel` has its own view model with the `foo` property.



## Conclusion

The Neo.mjs view model and binding approach is simple and powerful. It gives you easy control 
over the scope of a value, which means you can share properties as globally or narrowly as needed.
