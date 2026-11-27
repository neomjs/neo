# Shared Bindable Data

Neo has a feature that allows shared, bindable, data.

A _state provider_ &mdash; `Neo.state.Provider` &mdash; instance holds properties that
can be bound to component properties.

```javascript live-preview
import Container from  '../container/Base.mjs';
import Label     from  '../component/Label.mjs';
import TextField from  '../form/field/Text.mjs';

class MainView extends Container {
    static config = {
        className: 'GS.data1.MainView',

        stateProvider: {
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
export default Neo.setupClass(MainView);
```

State provider properties are visible down the containment hierarchy:
Properties introduced in a parent container will be available to any child component, and properties
introduced in a specific component are only visible to that component. This approach makes it easy to control scope.

In the example above, the main view has a state provider that defines a property _foo_. A state provider property is
available within the view and its children. The child items &mdash; a label and a text field &mdash; can bind properties
to _foo_. As _foo_ changes, the properties are automatically updated. The example also shows that a binding can be
`twoWay`, which means a change to the property in the view is _pushed_ to the state provider.

<img width="75%" src="https://s3.amazonaws.com/mjs.neo.learning.images/gettingStarted/vm/VisualHierarchy.png"></img>

(Note that in the example above, the main view's state provider is defined in-line. Normally your state provider
would be coded in its own class that extends `Neo.state.Provider`, and you'd use that in your component.
Just like with items component configs, trivial configs may be done in-line, and non-trivial configs are
usually coded as separate classes.)

Below is another example.

```javascript live-preview
import Container from  '../container/Base.mjs';
import Label     from  '../component/Label.mjs';
import Panel     from  '../container/Panel.mjs';

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
MyPanel = Neo.setupClass(MyPanel);

class MainView extends Container {
    static config = {
        className: 'GS.data2.MainView',

        stateProvider: {
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
            // You wouldn't normally configure a state provider.
            // We're doing it here to illustrate state provider scope.
            stateProvider: {
                data: {
                    foo: 'child'
                }
            }
        }],
        style: {margin: '1em'}
    }
}
export default Neo.setupClass(MainView);
```

In this case, the main view has three child items of type `MyPanel`, each containing a label.
The main view has a state provider with a `foo` property, and the third child has its own state provider with a `foo` property.

<img width="75%" src="https://s3.amazonaws.com/mjs.neo.learning.images/gettingStarted/vm/VisualHierarchyFooShadowed.png"></img>

`MyPanel` contains a `Neo.component.Label` whose `text` value is bound to `foo`. To resolve the binding,
Neo.mjs looks up the containment hierarchy until it finds the value. For the first two panels the label
binding looks in the label, then in its `MyPanel` container, then in the main view &mdash; where it finds `foo`.

For the third child panel the label binding looks in the label, then in its `MyPanel`, but this time it finds it
because the third copy of `MyPanel` has its own state provider with the `foo` property.



## Conclusion

The Neo.mjs state provider and binding approach is simple and powerful. It gives you easy control
over the scope of a value, which means you can share properties as globally or narrowly as needed.
The reference page [Shared Bindable Data (State Providers)](../guides/datahandling/StateProviders.md) continues
with formulas, nested providers, class based providers and stores.
