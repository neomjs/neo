Inline Model

<pre data-neo>
import Container from  '../../../../src/container/Base.mjs';
import Label     from  '../../../../src/component/Label.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        model: {
            data: {
                hello: 'Hello',
                world: 'world!'
            }
        },
        itemDefaults: {
            module: Label,
            style : {margin: '1em'}
        },
        items: [{
            bind: {
                // We can use template literals containing VM data props
                text: data => `${data.hello} ${data.world}`
            }
        }, {
            bind: {
                // We can also use VM data props directly inside fat arrow functions
                text: data => data.hello + ' ' + data.world
            }
        }, {
            bind: {
                // We can convert the config into a function to use VM data props
                text(data) {return data.hello + ' ' + data.world}
            }
        }],
        layout: 'vbox'
    }
}
Neo.setupClass(MainView);
</pre>
