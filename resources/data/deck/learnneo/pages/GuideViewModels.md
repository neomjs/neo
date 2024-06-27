Inline Model

<pre data-neo>
import Button    from  '../../../../src/button/Base.mjs';
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
    }, {
            module : Button,
            handler: data => data.component.getModel().setData({hello: 'Hi'}),
            text   : 'Change Hello'
        }, {
            module : Button,
            handler: data => data.component.getModel().setData({world: 'Neo.mjs!'}),
            text   : 'Change World'
        }],
        layout: {ntype: 'vbox', align: 'start'}
    }
}
Neo.setupClass(MainView);
</pre>

Nested Inline Models

<pre data-neo>
import Button    from  '../../../../src/button/Base.mjs';
import Container from  '../../../../src/container/Base.mjs';
import Label     from  '../../../../src/component/Label.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        model: {
            data: {
                hello: 'Hello'
            }
        },
        layout: 'fit',
        items : [{
            module: Container,
            model: {
                data: {
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
            }, {
                module : Button,
                handler: data => data.component.getModel().setData({hello: 'Hi'}),
                text   : 'Change Hello'
            }, {
                module : Button,
                handler: data => data.component.getModel().setData({world: 'Neo.mjs!'}),
                text   : 'Change World'
            }],
            layout: {ntype: 'vbox', align: 'start'}
        }]
    }
}
Neo.setupClass(MainView);
</pre>
