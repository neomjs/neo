All components fire events. For example, form fields fire a `change` event, various 
focus events, and others. Some other types fire events too, such as `Neo.data.Store`, 
which fires a `load` event after the store is loaded with data.

Some terminology related to events is that events are _fired_, and as a result, some 
event _handler_ &mdash; or _listener_ &mdash; is run.

To specify an event handler, use `listeners: {}`, specifying in as many event/handler
pairs as you need. 

The code below shows two text fields, with `listeners` for `change` and `focusEnter`.
(The events for any component are documened in the API docs.)

<pre data-neo>
import Base from '../../../../src/container/Base.mjs';
import TextField from '../../../../src/form/field/Text.mjs';
class MainView extends Base {
    static config = {
        className : 'Example.view.MainView',
        layout: {ntype:'vbox', align:'start'},
        items : [{
            module: TextField,
            labelText  : 'First name',
            listeners: {
                change: data=>console.log(data.value), // There are other properties, like oldValue
                focusEnter: data=>console.log(`Entering ${data.component.labelText}`) 
            }
        },
        {
            module: TextField,
            labelText  : 'Last name',
            listeners: {
                change: data=>console.log(data.value), // There are other properties, like oldValue
                focusEnter: data=>console.log(`Entering ${data.component.labelText}`) 
            }
        }]
    }
}
Neo.applyClassConfig(MainView);
</pre>

If you run the example, and open the browser's debugger, you'll see the console being logged as you type or give
focus to either field.

Note that the handlers specify an in-line function. For trivial cases, that might be ok. But normally
you'd want better separation of concerns by placing those event handlers in a separate class. Neo.mjs provides
that with a _component controller_. 

A `Neo.controller.Component` is a simple class associated with a component class. As a view is created, an 
instance of its associated contoller is automatically created. 

<pre data-neo>
import Base        from  '../../../../src/container/Base.mjs';
import Controller  from  '../../../../src/controller/Component.mjs';
import TextField  from   '../../../../src/form/field/Text.mjs';

class MainViewController extends Controller {
    static config = {
        className: 'Example.view.MainViewController'
    }
    onChange(data){
        console.log(data.value);
    }
}
Neo.applyClassConfig(MainViewController);


class MainView extends Base {
    static config = {
        className : 'Example.view.MainView',
        controller: MainViewController,
        layout: {ntype:'vbox', align:'start'},
        items : [{
            module: TextField,
            labelText  : 'Name',
            listeners: {
                change: 'onChange'
            }
        }]
    }
}
Neo.applyClassConfig(MainView);
</pre>

(It's important to keep in mind that in Neo.mjs, all class definitions are coded in their own
source file: one class per file. In the examples we're putting all the relevant classes together
to make it easier to see the source code for every class being used. But in an 
actual applications the controller class would be coded in its own source file &mdash; named something
like `MainViewController.mjs` &mdash; and that would be imported into the view.)

The ability to fire events and add listeners is provided by `Neo.core.Observable`, which is mixed into 
classes that need that ability. All components are observable, `Neo.data.Store` is observable, and some
others. `Neo.core.Observable` introduces a few methods and properties, such as `listeners`, which
is used in the examples above, `on()` for procedurally adding an event listener, and `fire()`, which is 
how you fire events in the custom classes you create.

Here's example illustrating how `fire()` is used. The code defines a `ToggleButton`
class, which is just a button with a `checked` property: the button shows a checked or unchecked
checkbox depending on the value of `checked`. 

The code uses a special Neo.mjs feature you haven't seen yet &mdash; the use of an underscore property. 
We'll discuss that at length later, but in a nutshell, config properties ending in an underscore 
automatically get lifecycle methods run before the value is assigned, after the value is assigned, and 
before the value is accessed. We're using the _after_ method to fire a `change` event.

<pre data-neo>
import Base        from  '../../../../src/container/Base.mjs';
import Button  from  '../../../../src/button/Base.mjs';
import TextField  from   '../../../../src/form/field/Text.mjs';

class ToggleButton extends Button {
    static config = {
        className: 'Example.view.ToggleButton',
        checked_: false
    }
    afterSetChecked(checked){
        this.iconCls = checked?'fa fa-square-check':'fa fa-square';
        this.fire('change', {component: this, checked}); // This is where our custom event is being fired
    }
    onClick(data){
        super.onClick(data); 
        this.checked = !this.checked;      
    }
}
Neo.applyClassConfig(ToggleButton);


class MainView extends Base {
    static config = {
        className : 'Example.view.MainView',
        layout: {ntype:'vbox', align:'start'},
        items : [{
            module: ToggleButton,
            text: 'Toggle',
            listeners: {
                change: data => console.log(data.checked) // Here, we're listening to the custom event
            }
        }]
    }
}
Neo.applyClassConfig(MainView);
</pre>

How are events set up? We don't really care, but in case you're curious: Neo.mjs has a `Neo.core.Observable` class
that can be mixed into any class. It maintains a `listeners` object map that's a key-value pair, where
the key is the event name, and the value is an array of function references. The first time a listener is 
added an entry is added to the map using the event name as the key, and the event handler added as the first
item in the associated array. If another listener is added for the same event, a second item is added to the
array. If a new event is added, a new entry is added. Etc. When the event is fired, Neo.mjs looks up the map
entry for the event name, then runs each function in the array, passing whatever data is specified in the
call to `fire()`.

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/gettingStarted/events/ObservableInMemory.png"></img>
