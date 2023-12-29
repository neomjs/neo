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