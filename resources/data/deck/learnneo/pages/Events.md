## Introduction

All components fire events. For example, form fields fire a `change` event, various 
focus events, and others. Some other types fire events too, such as `Neo.data.Store`, 
which fires a `load` event after the store is loaded with data.

Some terminology related to events is that events are _fired_, and as a result, some 
event _handler_ &mdash; or _listener_ &mdash; is run.

## Listeners

To specify an event handler, use `listeners: {}`, specifying in as many event/handler
pairs as you need. 

The code below shows two text fields, with `listeners` for `change` and `focusEnter`.
(The events for any component are documented in the API docs.)

<pre data-neo>
import Container from '../../../../src/container/Base.mjs';
import TextField from '../../../../src/form/field/Text.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module   : TextField,
            labelText: 'First name',
            listeners: {
                change    : data => Neo.Main.log({value:data.value}),
                focusEnter: data => Neo.Main.log({value: `Entering ${data.component.labelText}`}) 
            }
        }, {
            module   : TextField,
            labelText: 'Last name',
            listeners: {
                change    : data => Neo.Main.log({value: data.value}),
                focusEnter: data => Neo.Main.log({value: `Entering ${data.component.labelText}`}) 
            }
        }]
    }
}
Neo.setupClass(MainView);
</pre>

If you run the example, and open the browser's debugger, you'll see the console being logged as you type or give
focus to either field.

## In-line or separated into a controller

Note that the handlers specify an in-line function. For trivial cases, that might be ok. But normally
you'd want better separation of concerns by placing those event handlers in a separate class. Neo.mjs provides
that with a _component controller_. 

A `Neo.controller.Component` is a simple class associated with a component class. As a view is created, an 
instance of its associated controller is automatically created. 

<pre data-neo>
import Container  from '../../../../src/container/Base.mjs';
import Controller from '../../../../src/controller/Component.mjs';
import TextField  from  '../../../../src/form/field/Text.mjs';

class MainViewController extends Controller {
    static config = {
        className: 'Example.view.MainViewController'
    }
    onChange(data) {
        Neo.Main.log({value: data.value})
    }
}
Neo.setupClass(MainViewController);


class MainView extends Container {
    static config = {
        className : 'Example.view.MainView',
        controller: MainViewController,
        layout    : {ntype:'vbox', align:'start'},
        items     : [{
            module   : TextField,
            labelText: 'Name',
            listeners: {
                change: 'onChange'
            }
        }]
    }
}
Neo.setupClass(MainView);
</pre>

(It's important to keep in mind that in Neo.mjs, all class definitions are coded in their own
source file: one class per file. In the examples we're putting all the relevant classes together
to make it easier to see the source code for every class being used. But in an 
actual applications the controller class would be coded in its own source file &mdash; named something
like `MainViewController.mjs` &mdash; and that would be imported into the view.)

## Neo.core.Observable

The ability to fire events and add listeners is provided by `Neo.core.Observable`, which is mixed into 
classes that need that ability. All components are observable, `Neo.data.Store` is observable, and some
others. `Neo.core.Observable` introduces a few methods and properties, such as `listeners`, which
is used in the examples above, `on()` for procedurally adding an event listener, and `fire()`, which is 
how you fire events in the custom classes you create.

## Firing an event when a value changes

Here's example illustrating how `fire()` is used. The code defines a `ToggleButton`
class, which is just a button with a `checked` property: the button shows a checked or unchecked
checkbox depending on the value of `checked`. 

The code uses a special Neo.mjs feature you haven't seen yet &mdash; the use of an underscore property. 
We'll discuss that at length later, but in a nutshell, config properties ending in an underscore 
automatically get lifecycle methods run before the value is assigned, after the value is assigned, and 
before the value is accessed. We're using the _after_ method to fire a `change` event.


<pre data-neo>
import Button    from '../../../../src/button/Base.mjs';
import Container from '../../../../src/container/Base.mjs';

class ToggleButton extends Button {
    static config = {
        className: 'Example.view.ToggleButton',
        checked_ : false
    }
    afterSetChecked(checked) {
        this.iconCls = checked ? 'fa fa-square-check' : 'fa fa-square';
        
        // This is where our custom event is being fired
        this.fire('change', {component: this, checked})
    }
    onClick(data) {
        super.onClick(data); 
        this.checked = !this.checked
    }
}
Neo.setupClass(ToggleButton);


class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module   : ToggleButton,
            text     : 'Toggle',
            listeners: {
                // Here, we're listening to the custom event
                change: data => Neo.Main.log({value: data.checked})
            }
        }]
    }
}
Neo.setupClass(MainView);
</pre>
