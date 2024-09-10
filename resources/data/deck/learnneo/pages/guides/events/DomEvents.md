## Subscribing to DOM events

<pre data-neo>
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.domevents.MainView',
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
