View models (VMs) in Neo.mjs are state providers.

While Components can manage their own state using the Class Config System,
you want to use VMs as soon as you want to share data properties with multiple child Components.

Rules of thumb:
1. Leaf Components inside the Component Tree (Container items) will most likely not need a VM.
2. We can define multiple VMs as needed (they do communicate).
3. We want to define shared state data properties as low inside the component tree as possible.

We often reference a VM as `model.Component` (the class name inside Neo.mjs),
other libraries or frameworks often call them Stores.

Since we also have Data Stores (tabular data), we chose to use the name VM to avoid confusion.

## Inline Model
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
                // We can also use VM data props directly inside fat arrow function bodies
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

We use a Container with a VM containing the data props `hello` and `world`.
Inside the Container are 3 Labels which bind their `text` Config to a combination of both data props.

We are showcasing 3 different ways how you can define your binding (resulting in the same output).

In case any of the bound data props changes, all bound Configs will check for an update.

Important: The Config setter will only trigger in case there is a real change for the bound output.

We also added 2 Buttons to change the value of each data prop, so that we can see that the bound Label texts
update right away.

Let us take a look at the Button handler:</br>
`data.component.getModel().setData({world: 'Neo.mjs!'})`

data.component equals to the Button instance itself. Since the Button instance does not have its own VM,
`getModel()` will return the closest VM inside the parent chain.

## Nested Inline Models

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
                    // We can also use VM data props directly inside fat arrow function bodies
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
