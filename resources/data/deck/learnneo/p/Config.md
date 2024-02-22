As you've probably noticed, Neo.mjs classes have a `static config` property. 

The `config` specifies properties that are applied to instances as they are
created. In addition, Neo.mjs uses that information to set up propoerty lifecycle 
methods.

Here's an example of a new component class `Simple` with three config properties:

1. `className` &mdash; used by Neo.mjs to keep track of every class
2. `foo` &mdash; an instance property 
2. `bar_` &mdash; another instance property 

<pre data-neo>
import Component  from '../../../../src/component/Base.mjs';
import Container  from '../../../../src/container/Base.mjs';

class Simple extends Component {
    static config = {
        className: 'Example.view.Simple',

        foo: 1,        // An instance field and its initial (default) value
        bar_: ''       // Another instance field -- note the underscore at the end

    }

}
Neo.setupClass(Simple);


class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',

        items: [{
            module: Simple,

            foo: 17,         // This is applied to the instance
            bar: 'hi there'  // This is applied to the instance

        }]

    }
}
Neo.setupClass(MainView);
</pre>

The `Simple` class doesn't have any content, so if you run the code you won't see anything. We'll 
change that in the next example.

Note that the `bar` property is defined with an underscore at the end. That tags the property as
a _lifecyle property_. A lifecycle property provides methods that are run as the property is
updated or accessed. You're free to implment the methods to implement business rules, normalize
values, or have side-effects, such as updating a view or firing an event.

<pre data-neo>
import Component  from '../../../../src/component/Base.mjs';
import Container  from '../../../../src/container/Base.mjs';

class Simple extends Component {
    static config = {
        className: 'Example.view.Simple',

        foo: 1,        // An instance field and its initial (default) value
        bar_: null     // Another instance field -- note the underscore at the end

    }

    beforeGetBar(){

    }
    beforeSetBar(value, oldValue){
        // Use value if it's not empty
        if (value) return value; 
    }
    afterSetBar(value, oldValue){
        this.html = value;
        this.fire('barChange', {component: this, value, oldValue});
    }

}
Neo.setupClass(Simple);


class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',

        items: [{
            module: Simple,

            foo: 17 ,        // This is applied to the instance
            bar: 'hi there'  // This is applied to the instance

        }]

    }
}
Neo.setupClass(MainView);
</pre>

This time if you run the code you'll "hi there" in the view. That's because the Simple instance is
configured with `bar: 'hi there'`, and since that's a lifecycle property the `afterSetBar()` method
is run. That method updates the view with the passed value.

Updating a view is a common use case for the _afterSet_ method. It's also often used to fire an event. 
Look at this code: `afterSetBar()` fires an event, and the config in the `items[]` is listening to it.

<pre data-neo>
import Component  from '../../../../src/component/Base.mjs';
import Container  from '../../../../src/container/Base.mjs';

class Simple extends Component {
    static config = {
        className: 'Example.view.Simple',

        foo: 1,        // An instance field and its initial (default) value
        bar_: null     // Another instance field -- note the underscore at the end

    }

    beforeGetBar(){

    }
    beforeSetBar(value, oldValue){
        // Use value if it's not empty
        if (value) return value; 
    }
    afterSetBar(value, oldValue){
        this.html = value;
        this.fire('barChange', {component: this, value, oldValue});
    }

}
Neo.setupClass(Simple);


class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',

        items: [{
            module: Simple,

            foo: 17 ,        // This is applied to the instance
            bar: 'hi there', // This is applied to the instance

            listeners: {
                barChange: data => Neo.Main.alert({message: data.value})
            }

        }]

    }
}
Neo.setupClass(MainView);
</pre>

