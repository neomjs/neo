All components fire events. For example, form fields fire a `change` event, various 
focus events, and others. Some other types fire events too, such as `Neo.data.Store`, 
which fires a `load` event after the store is loaded with data.

Some terms relating to events is that events are _fired_, and as a result, some event
_handler_ or event _listener_ is run.

In Neo.mjs, any class config can be specified declaratively, or run procedurally.
To specify an event declaratively, use `listeners: {}`, specifying in as many event/handler
pairs as you need. Or, you can use the `on()` method, specifying the event name and 
handler function. 

<pre data-neo>
import Base from '../../../../src/container/Base.mjs';
import TextField from '../../../../src/form/field/Text.mjs';
class MainView extends Base {
    static config = {
        className : 'Example.view.MainView',
        layout: {ntype:'vbox', align:'start'},
        items : [{
            module: TextField,
            labelText  : 'Name',
            listeners: {
                change: data=>console.log(data.value) // There are other properties, like oldValue
            }
        }]
    }
}
Neo.applyClassConfig(MainView);
</pre>

If you run the example, and open the browser's debugger, you'll see the console being logged as you type. 

Note that the `change` handler specifies an in-line funcion. For trivial cases, that might be ok. But normally
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

It's important to keep in mind that in Neo.mjs, all class definitions are coded in their own
source file: one class per file. In the examples we're putting all the relevant classes together
to make it easier to see all the source code in one place. But in an 
actual applications the controller class would be coded in its own source file &mdash; named something
like `MainViewController.mjs` &mdash; and that would be imported into the view. 

