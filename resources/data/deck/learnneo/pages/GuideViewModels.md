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

## Inline Models
### Direct Bindings
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
                text: data => data.hello
            }
        }, {
            bind: {
                text: data => data.world
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
Inside the Container are 2 Labels which bind their `text` config to a data prop directly.

We can easily bind 1:1 to specific data props using the following syntax:</br>
`bind: {text: data => data.hello}`

### Bindings with multiple data props
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
Inside the Container are 3 Labels which bind their `text` config to a combination of both data props.

We are showcasing 3 different ways how you can define your binding (resulting in the same output).

In case any of the bound data props changes, all bound Configs will check for an update.

Important: The Config setter will only trigger in case there is a real change for the bound output.

We also added 2 Buttons to change the value of each data prop, so that we can see that the bound Label texts
update right away.

Let us take a look at the Button handler:</br>
`data.component.getModel().setData({world: 'Neo.mjs!'})`

data.component equals to the Button instance itself. Since the Button instance does not have its own VM,
`getModel()` will return the closest VM inside the parent chain.

### Nested Inline Models
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

The output of this demo is supposed to exactly look the same like the previous demo.

This time we nest our Labels into a Container with a fit layout.
Just for demo purposes, we want to avoid overnesting inside real apps.

Our top level VM now only contains the `hello` data prop, and we added a second VM inside the nested Container
which contains the `world` data prop.

As a result, the bindings for all 3 Labels contain a combination of data props which live inside different VMs.
As long as these VMs are inside the parent hierarchy this works fine.

The same goes for the Button handlers: `setData()` will find the closest matching data prop inside the VM parent chain.

We can even change data props which live inside different VMs at once. As easy as this:</br>
`setData({hello: 'foo', world: 'bar'})`

Hint: Modify the example code (Button handler) to try it out right away!

### Nested Data Properties
<pre data-neo>
import Button    from  '../../../../src/button/Base.mjs';
import Container from  '../../../../src/container/Base.mjs';
import Label     from  '../../../../src/component/Label.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        model: {
            data: {
                user: {
                    firstname: 'Tobias',
                    lastname : 'Uhlig'
                }
            }
        },
        itemDefaults: {
            module: Label,
            style : {margin: '1em'}
        },
        items: [{
            bind: {
                text: data => `${data.user.firstname} ${data.user.lastname}`
            }
        }, {
            bind: {
                text: data => data.user.firstname + ' ' + data.user.lastname
            }
        }, {
            module : Button,
            handler: data => data.component.getModel().setData({user: {firstname: 'Max'}}),
            text   : 'Change Firstname'
        }, {
            module : Button,
            handler: data => data.component.getModel().setData({'user.lastname': 'Rahder'}),
            text   : 'Change Lastname'
        }],
        layout: {ntype: 'vbox', align: 'start'}
    }
}
Neo.setupClass(MainView);
</pre>
Data props inside VMs can be nested. Our VM contains a `user` data prop as an object,
which contains the nested props `firstname` and `lastname`.

We can bind to these nested props like before:</br>
`bind: {text: data => data.user.firstname + ' ' + data.user.lastname}`

Any change of a nested data prop will directly get reflected into the bound components.

We can update a nested data prop with passing its path:</br>
`data => data.component.getModel().setData({'user.lastname': 'Rahder'})`

Or we can directly pass the object containing the change(s):</br>
`data => data.component.getModel().setData({user: {firstname: 'Max'}})`

Hint: This will not override left out nested data props (lastname in this case).

## Class based Models
When your models contain many data props or need custom logic, you can easily move them into their own classes.

### Direct Bindings
<pre data-neo>
import Button    from  '../../../../src/button/Base.mjs';
import Container from  '../../../../src/container/Base.mjs';
import Label     from  '../../../../src/component/Label.mjs';
import ViewModel from  '../../../../src/model/Component.mjs';

class MainViewModel extends ViewModel {
    static config = {
        className: 'Example.view.MainViewModel',
        data: {
            hello: 'Hello',
            world: 'world!'
        }
    }
}

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        model    : MainViewModel, // directly assign the imported module

        itemDefaults: {
            module: Label,
            style : {margin: '1em'}
        },
        items: [{
            bind: {
                text: data => data.hello
            }
        }, {
            bind: {
                text: data => data.world
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
