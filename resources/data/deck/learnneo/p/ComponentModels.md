
Neo has a feature that allows shared, bindable, data.

A _view model_ &mdash; `Neo.model.Component` &mdash; instance holds properties that 
can be bound to component properties.

<pre data-neo>
import Base            from  '../../../../src/container/Base.mjs';
import Label           from  '../../../../src/component/Label.mjs';
import TextField       from  '../../../../src/form/field/Text.mjs';

class MainView extends Base {
    static config = {
        className : 'Example.view.MainView',

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
            width: 300,
        }],
        style: {padding: '1em'},
    }
}
Neo.applyClassConfig(MainView);
</pre>

View model properties are visible up the containment hierarchy:
Properties introduced in a parent container will be available to any child component, and properties
introduces in a specific component are only visible to that component. This approach makes it easy to control scope.

In this example the main view has three child items of type `MyPanel`. The main view has a view model with a 
`foo` property, and the third child has its own view model with a `foo` property.

`MyPanel` contains a `Neo.componnet.Label` whose `text` value is bound to `foo`. To resolve the binding, Neo.mjs looks up the
containment hierarchy until it finds the value. For the first two panels the label binding looks in the label, then in its `MyPanel`
container, then in the main view where it finds `foo`. For the third child panel the label binding looks in the label,
then in its `MyPanel` and finds it because the third copy of `MyPanel` has its own view model with the `foo` property.

The bottom line is the Neo.mjs view model and binding approach is simple and powerful, and gives you easy control over the scope
of a value. Thus, you can share properties as globally or narrowly as needed.

<pre data-neo>
import Base            from  '../../../../src/container/Base.mjs';
import Panel           from  '../../../../src/container/Panel.mjs';
import Label           from  '../../../../src/component/Label.mjs';

class MyPanel extends Panel {
    static config = {
        className : 'Example.view.MyPanel',
        headers: [{
            dock: 'top',
            items: [{ module: Label, text: 'MyPanel' }]
        }],
        items: [{ 
            module: Label, 
            bind: {
                text: data => `The value of foo is "${data.foo}"` 
            },
            style: {margin: '1em'}
        }],
        style: {margin: '1em'},
    }
}
Neo.applyClassConfig(MyPanel);

class MainView extends Base {
    static config = {
        className : 'Example.view.MainView',

        model: {
            data: {
                foo: 'parent'
            }
        },
        layout: 'hbox',
        items: [{
            module: MyPanel,
        }, {
            module: MyPanel,
        }, {
            module: MyPanel,
            model: {
                data: {
                    foo: 'child'
                }
            }
        }],
        style: {margin: '1em'},
    }
}
Neo.applyClassConfig(MainView);
</pre>





Note that in the example above, the view model is in-line. Normally your view model would be 
coded in its own class that extends 'Neo.model.Component', and you'd use that in your component.
Just like with items component configs, trivial configs are often done in-line, and non-trivial 
configs are coded as separate classes.

