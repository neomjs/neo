As you read in the Getting Started > Events topic, components, stores, and many other objects fire events.


<pre data-neo>
import Container from '../../../../src/container/Base.mjs';
import TextField from '../../../../src/form/field/Text.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},

        itemDefaults: {
            module   : TextField,
            listeners: {
                change    : data => Neo.Main.log({value:data.value}), // Neo.Main.log logs to the main thread console
                focusEnter: data => Neo.Main.log({value: `Entering ${data.component.labelText}`}) 
            }
        },

        items: [{
            labelText: 'First name'
        }, {
            labelText: 'Last name'
        }]
    }
}
Neo.setupClass(MainView);
</pre>

## Event listeners

### In-line

The event listener function can be coded in-line. Normally, you want event handlers to be in a view's controller, 
but for very simple situation it can be convenient to use this syntax.

<pre data-neo>
import Container from '../../../../src/container/Base.mjs';
import Button from '../../../../src/button/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},

        items: [{
            module   : Button,
            text: 'Button',
            listeners: { 
                click: button => Neo.Main.log('Click!');
            }
        }]
    }
}
Neo.setupClass(MainView);
</pre>

### As a view method

You can also use the `up.` qualifier to specify a method in the component's parent view. Like the
in-line syntax above, using `up.` might be convenient for simple event handlers, or when you 
simply haven't gotten around to definining a view's controller.

<pre data-neo>
import Container from '../../../../src/container/Base.mjs';
import Button from '../../../../src/button/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},

        items: [{
            module   : Button,
            text: 'Button',
            listeners: {
                click: 'up.onButtonClick'
            }
        }]
    }

    onButtonClick(){
        Neo.Main.log(arguments);
    }
}
Neo.setupClass(MainView);
</pre>

### As a controller method

## Adding listeners procedurally

Event listeners are normally specified declaratively, via the `listeners: {}` config. But occasionally you need to add
a listener proccedurally.

Any obversable class has an `addListener` method. There's also an easier to type version called `on`.



## Events versus binding

Events and binding are similar concepts &mdash; both are a way to detect, and react to, some kind of action or change.

Events are fired for user actions, such as a button click event, a component receiving focus, or a field value changing. 
Non-visual classes can also fire an event; for example, a `Neo.data.Store` fires a `load` event, and other events
relating to changes to the store. The event handler if a function run when the event fires.

A binding detects a changed view model value, and assigns it to a property. 


### When to use an event

Events and event handlers are used when you need to run non-trivial logic in response to the event. For example, you 
might have a Save button, and in its click event handler you'd write logic to make a backend call. 

Events can be fired for a state change, such as an input field's value changing, or something like a user event,
like a button click or component focus.


### When to use a binding

A binding is a way to keep properties in sync with values in the view model hierarchy. For example, button text, 
field values, or store properties, can simultaneously reflect the same view model property. That's pretty handy, 
but keep in mind that a class can define a property as a _lifecycle property_. That means that updating a property
can may result in complex logic being triggered. Furthermore, a _two way binding_ meansx 



##

[Add content on listeners options here]

How are events set up? The details don't really matter, but in case you're curious: 
Neo.mjs has a `Neo.core.Observable` class that can be mixed into any class. It maintains 
a `listeners` object map that's a key-value pair, where the key is the event name, and 
the value is an array of function references. The first time a listener is added, an 
entry is added to the map using the event name as the key, and the event handler added 
as the first item in the associated array. If another listener is added for the same 
event, a second item is added to the array. If a new event is added, a new entry is 
added. Etc. When the event is fired, Neo.mjs looks up the map entry for the event name, 
then runs each function in the array, passing whatever data is specified in the call to `fire()`.

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/gettingStarted/events/ObservableInMemory.png"></img>
