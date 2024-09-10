## Delegated global DOM Events

By default, Neo.mjs will attach DOM event listeners for all common events to the `document.body`.
You can the see the full list of event names inside:
<a href='https://github.com/neomjs/neo/blob/dev/src/manager/DomEvent.mjs' target='_blank'>manager.DomEvent</a>.

When subscribing to DOM events, the framework will automatically ensure that delegated events arrive
inside the Components where you subscribed to them.

An example: A typical Neo.mjs App will only have one global click listener.

## DOM Events are separated from the virtual DOM

Since we are frequently passing the `vdom` from the App Worker to the Data Worker,
it is crucial that our markup representation can get serialised.

So it has become a design goal to fully separate markup and logic.
The following examples will showcase how you can easily subscribe to DOM events in different ways.

## Subscribing to DOM Events

While we already have a fully polished
<a href='https://github.com/neomjs/neo/blob/dev/src/button/Base.mjs' target='_blank'>button.Base</a>
class inside the framework which you should use, the following examples will manually create
Button tags to showcase how you can subscribe to click events.

### Inline

For debugging purposes, you can specify your handler logic directly inline.

For the first Button, we are using a fat arrow function, in which case the scope will point to
the class. If you add `console.log(this);`, the output is most likely not want you want.

For the second Button we are defining a non-bound function, in which case `this` will point
to the Component instance.

<pre data-neo>
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.domevents1.MainView',
        layout   : {ntype:'vbox', align:'start'},
        style    : {padding: '1em'},

        items: [{
            vdom: {tag: 'button', innerHTML: 'Button 1'},

            domListeners: [{
                click: data => Neo.Main.log({value: `Clicked on ${data.component.id}`})
            }]
        }, {
            style: {marginTop: '1em'},
            vdom : {tag: 'button', innerHTML: 'Button 2'},

            domListeners: [{
                click(data) {
                    Neo.Main.log({value: `Clicked on ${data.component.id}`})
                }
            }]
        }]
    }
}
MainView = Neo.setupClass(MainView);
</pre>

### Handler inside the Component Tree

When creating new Components, it can make sense to add the handler methods into the class.
A good example would be `tab.header.Toolbar`, where clicking on a Button will change the active Card.

You can use string based listeners. In case the handler method lives within the parent tree (any level),
we need to prefix there listeners with `up.`.

<pre data-neo>
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.domevents2.MainView',
        layout   : {ntype:'vbox', align:'start'},
        style    : {padding: '1em'},

        items: [{
            vdom: {tag: 'button', innerHTML: 'Click me!'},

            domListeners: [{
                click: 'up.onButtonClick'
            }]
        }]
    }

    onButtonClick(data) {
        Neo.Main.log({value: `Clicked on ${data.component.id}`})
    }
}
MainView = Neo.setupClass(MainView);
</pre>
