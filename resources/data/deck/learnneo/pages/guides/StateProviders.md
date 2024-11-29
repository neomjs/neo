While Components can manage their own state using the Class Config System,
you want to use VMs as soon as you want to share data properties with multiple child Components.

Rules of thumb:
1. Leaf Components inside the Component Tree (Container items) will not need a state provider.
2. We can define multiple state providers as needed (they do communicate).
3. We want to define shared state data properties as low inside the component tree as possible.

Other libraries or frameworks often call state providers "Stores".

## Inline State Providers
### Direct Bindings
<pre data-neo>
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';
import Label     from '../component/Label.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.vm1.MainView',
        stateProvider: {
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
            handler: data => data.component.setState({hello: 'Hi'}),
            text   : 'Change Hello'
        }, {
            module : Button,
            handler: data => data.component.setState({world: 'Neo.mjs!'}),
            text   : 'Change World'
        }],
        layout: {ntype: 'vbox', align: 'start'}
    }
}
MainView = Neo.setupClass(MainView);
</pre>

We use a Container with a stateProvider containing the data props `hello` and `world`.
Inside the Container are 2 Labels which bind their `text` config to a data prop directly.

We can easily bind 1:1 to specific data props using the following syntax:</br>
`bind: {text: data => data.hello}`

### Bindings with multiple data props
<pre data-neo>
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';
import Label     from '../component/Label.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.vm2.MainView',
        stateProvider: {
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
            handler: data => data.component.setState({hello: 'Hi'}),
            text   : 'Change Hello'
        }, {
            module : Button,
            handler: data => data.component.setState({world: 'Neo.mjs!'}),
            text   : 'Change World'
        }],
        layout: {ntype: 'vbox', align: 'start'}
    }
}
MainView = Neo.setupClass(MainView);
</pre>

We use a Container with a stateProvider containing the data props `hello` and `world`.
Inside the Container are 3 Labels which bind their `text` config to a combination of both data props.

We are showcasing 3 different ways how you can define your binding (resulting in the same output).

In case any of the bound data props changes, all bound Configs will check for an update.

Important: The Config setter will only trigger in case there is a real change for the bound output.

We also added 2 Buttons to change the value of each data prop, so that we can see that the bound Label texts
update right away.

Let us take a look at the Button handler:</br>
`data.component.setState({world: 'Neo.mjs!'})`

This is a shortcut syntax for:</br>
`data.component.getStateProvider().setData({world: 'Neo.mjs!'})`

data.component equals to the Button instance itself. Since the Button instance does not have its own stateProvider,
`getStateProvider()` will return the closest stateProvider inside the parent chain.

### Nested Inline State Providers
<pre data-neo>
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';
import Label     from '../component/Label.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.vm3.MainView',
        stateProvider: {
            data: {
                hello: 'Hello'
            }
        },
        layout: 'fit',
        items : [{
            module: Container,
            stateProvider: {
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
                handler: data => data.component.setState({hello: 'Hi'}),
                text   : 'Change Hello'
            }, {
                module : Button,
                handler: data => data.component.setState({world: 'Neo.mjs!'}),
                text   : 'Change World'
            }],
            layout: {ntype: 'vbox', align: 'start'}
        }]
    }
}
MainView = Neo.setupClass(MainView);
</pre>

The output of this demo is supposed to exactly look the same like the previous demo.

This time we nest our Labels into a Container with a fit layout.
Just for demo purposes, we want to avoid overnesting inside real apps.

Our top level stateProvider now only contains the `hello` data prop, and we added a second stateProvider inside the 
nested Container which contains the `world` data prop.

As a result, the bindings for all 3 Labels contain a combination of data props which live inside different stateProviders.
As long as these VMs are inside the parent hierarchy this works fine.

The same goes for the Button handlers: `setData()` will find the closest matching data prop inside the stateProvider parent chain.

We can even change data props which live inside different stateProviders at once. As easy as this:</br>
`setData({hello: 'foo', world: 'bar'})`

Hint: Modify the example code (Button handler) to try it out right away!

### Nested Data Properties
<pre data-neo>
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';
import Label     from '../component/Label.mjs';

class MainView extends Container {
    static config = {
        className: 'Guides.vm4.MainView',
        stateProvider: {
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
            handler: data => data.component.setState({user: {firstname: 'Max'}}),
            text   : 'Change Firstname'
        }, {
            module : Button,
            handler: data => data.component.setState({'user.lastname': 'Rahder'}),
            text   : 'Change Lastname'
        }],
        layout: {ntype: 'vbox', align: 'start'}
    }
}
MainView = Neo.setupClass(MainView);
</pre>
Data props inside VMs can be nested. Our stateProvider contains a `user` data prop as an object,
which contains the nested props `firstname` and `lastname`.

We can bind to these nested props like before:</br>
`bind: {text: data => data.user.firstname + ' ' + data.user.lastname}`

Any change of a nested data prop will directly get reflected into the bound components.

We can update a nested data prop with passing its path:</br>
`data => data.component.setState({'user.lastname': 'Rahder'})`

Or we can directly pass the object containing the change(s):</br>
`data => data.component.setState({user: {firstname: 'Max'}})`

Hint: This will not override left out nested data props (lastname in this case).

### Dialog connecting to a Container
<pre data-neo>
import Controller from '../controller/Component.mjs';
import Dialog     from '../dialog/Base.mjs';
import Panel      from '../container/Panel.mjs';
import TextField  from '../form/field/Text.mjs';
import Viewport   from '../container/Viewport.mjs';

class EditUserDialogController extends Controller {
    static config = {
        className: 'Neo.examples.model.dialog.EditUserDialogController'
    }

    onFirstnameTextFieldChange(data) {
        this.setState({'user.firstname': data.value || ''})
    }

    onLastnameTextFieldChange(data) {
        this.setState({'user.lastname': data.value || ''})
    }
}
EditUserDialogController = Neo.setupClass(EditUserDialogController);

class EditUserDialog extends Dialog {
    static config = {
        className      : 'Neo.examples.model.dialog.EditUserDialog',
        containerConfig: {style: {padding: '1em'}},
        controller     : EditUserDialogController,
        title          : 'Edit User',
        itemDefaults   : {module: TextField, flex: 'none', labelWidth: 110},
        items: [{
            bind     : {value: data => data.user.firstname},
            labelText: 'Firstname:',
            listeners: {change: 'onFirstnameTextFieldChange'}
        }, {
            bind     : {value: data => data.user.lastname},
            labelText: 'Lastname:',
            listeners: {change: 'onLastnameTextFieldChange'}
        }],
        wrapperStyle: {height: '300px', width : '400px'}
    }
}
EditUserDialog = Neo.setupClass(EditUserDialog);

class MainContainerController extends Controller {
    static config = {
        className: 'Neo.examples.model.dialog.MainContainerController',
        dialog   : null
    }

    onEditUserButtonClick(data) {
        let me = this;

        if (!me.dialog) {
            me.dialog = Neo.create({
                module         : EditUserDialog,
                animateTargetId: me.getReference('edit-user-button').id,
                appName        : me.component.appName,
                closeAction    : 'hide',

                stateProvider: {
                    parent: me.getStateProvider()
                }
            })
        } else {
            me.dialog.show()
        }
    }
}
MainContainerController = Neo.setupClass(MainContainerController);

class MainView extends Viewport {
    static config = {
        className : 'Guides.vm5.MainView',
        controller: MainContainerController,
        stateProvider: {
            data: {
                user: {
                    firstname: 'Tobias',
                    lastname : 'Uhlig'
                }
            }
        },
        style: {padding: '20px'},
        items: [{
            module: Panel,
            containerConfig: {
                layout: {ntype: 'vbox', align: 'start'},
                style : {padding: '20px'}
            },
            headers: [{
                dock : 'top',
                items: [{
                    ntype: 'label',
                    bind : {
                        text: data => `Current user: ${data.user.firstname} ${data.user.lastname}`
                    }
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    handler  : 'onEditUserButtonClick',
                    iconCls  : 'fa fa-user',
                    reference: 'edit-user-button',
                    text     : 'Edit user'
                }]
            }],

            items: [{
                ntype: 'label',
                text : 'Click the edit user button to edit the user data </br> inside this container view model.'
            }]
        }]
    }
}

MainView = Neo.setupClass(MainView);
</pre>

## Class based State Providers
When your stateProviders contain many data props or need custom logic, you can easily move them into their own classes.

### Direct Bindings
<pre data-neo>
import Button        from '../button/Base.mjs';
import Container     from '../container/Base.mjs';
import Label         from '../component/Label.mjs';
import StateProvider from '../state/Provider.mjs';

class MainViewStateProvider extends StateProvider {
    static config = {
        className: 'Guides.vm6.MainViewStateProvider',
        data: {
            hello: 'Hello',
            world: 'world!'
        }
    }
    onDataPropertyChange(key, value, oldValue) {
        super.onDataPropertyChange(key, value, oldValue);
        // do custom things there, like firing events
        Neo.Main.log({value: `onDataPropertyChange: key: ${key}, value: ${value}, oldValue: ${oldValue}`})
    }
}
MainViewStateProvider = Neo.setupClass(MainViewStateProvider);

class MainView extends Container {
    static config = {
        className    : 'Guides.vm6.MainView',
        stateProvider: MainViewStateProvider, // directly assign the imported module

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
            handler: data => data.component.setState({hello: 'Hi'}),
            text   : 'Change Hello'
        }, {
            module : Button,
            handler: data => data.component.setState({world: 'Neo.mjs!'}),
            text   : 'Change World'
        }],
        layout: {ntype: 'vbox', align: 'start'}
    }
}
MainView = Neo.setupClass(MainView);
</pre>
