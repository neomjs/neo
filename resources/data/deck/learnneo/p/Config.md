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
Neo.applyClassConfig(Simple);


class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',

        items: [{
            module: Simple,

            foo: 17          // This is applied to the instance
            bar: 'hi there'  // This is applied to the instance

        }]

    }
}
Neo.applyClassConfig(MainView);
</pre>

The `Simple` class doesn't have any content, so if you run the code you won't see anything.
But if you were to open the debugger in the `neomjs-app-worker` context you could see the values
via `Neo.findFirst('[foo]').foo`. or `Neo.findFirst('[foo]').bar` We'll talk more about `findFirst()`
and the console below.

Note that the `bar` property was defined with an underscore at the end. That tags the property as
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
Neo.applyClassConfig(Simple);


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
Neo.applyClassConfig(MainView);
</pre>


<pre>
items: [{
    module: Simple,
    html: 'simple', // This property is introduced in Neo.component.Base

    foo: 17         // This is applied to the instance

}]
</pre>

The config `{ module: Simple, html: 'Simple', foo: 17 }` is an object literal
_describing_ &mdash; or _configuring_ &mdash; the item in our main view. It's saying we want an instance 
of `Simple`, with two properties applied to the new instance: 

- `html`, this isn't used very often, but it's handy for stubbing out views
- `foo`, which is the property introduced in `Examples.view.Simple` 


Before moving on, let's break down that console statement. 

First, Neo.mjs is multi-threaded. Your app logic runs in the `neomjs-app-worker` context. 
In Chrome devtools you need to switch to 
that context via the dropdown at the top of of console panel. (We'll talk more about debugging
and the console in a later topic.)

The statement `Neo.findFirst('[foo]')` finds the first component with a `foo` property. The `Neo.findFirst()`
method is handy for getting component references when debugging.

When we add `.foo` to that, we're simply inspecting the value of that property at runtime &mdash; 17.