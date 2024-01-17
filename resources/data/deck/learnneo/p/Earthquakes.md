##Introduction 

In this topic you'll create an application that fetches data on earthquakes in Iceland,
and show the information in two views: a table, and a map.

You'll do this in a series of labs:

1. Generate a workspace
1. Generate a starter app
1. Learn some debugging tricks
1. Generate the earthquakes starter app
1. Refactor a config into its own class
1. Add a map
1. Listen to events
1. Make the app multi-window

##Goals 

What's the goal of this lengthy topic?

- To touch on fundamental Neo concepts
- To do some coding without emphasizing syntax details

Most of these labs are copy-and-paste because we're focusing on _what_ it's doing on rather than _how_.

As we progress through the training we'll spend more and more time on syntax and how, and you'll be more and more proficient at writing your own code.
##Key concepts

A few key concepts we'll be discussing:

- Creating a starter app
- Configuring components
- Debugging
- Class-based coding
- Component (view) models
- Events
- Controllers

##Advice

A word of advice: Throughout this tutorial, and others, Keep a high-level perspective, 
especially early on. We'll have plenty of time to get into the code, and we'll do 
most things multiple times. 

##Lab. Generate a workspace

In this lab, you'll generate a Neo.mjs workspace and run the starter app.

<!-- lab -->
<details>
<summary>Use the command-line to generate the workspace</summary>

Use a terminal window to navigate to some parent folder, 
then run 

    npx neo-app@latest

You'll be propted for a workspace name, starter app name, etc &mdash; accept the default for everything.
As the command finishes it starts a server and opens a browser window.
</details>

<details>
<summary>Inspect the workspace</summary>

The workspace contains a local copy of the API docs, an `apps` directory (where your apps are found), 
and some other directories.
</details>

<details>
<summary>Start the server</summary>
From the root of the `workspace` start the server via `npm run server-start`. That starts a server
at port 8080 and opens a new browser window.

<img src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/StartServer.png" style="width:80%"/>

</details>


<details>
<summary>Run the starter app</summary>

By default, an app named `myapp` was created. You can run it by entering the `apps` directory and 
clicking `myapp`. It's a folder containing an `index.html` along with the source code for the app.

<img src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/RunTheStarterApp.png" style="width:80%"/>

</details>

<!-- /lab -->


##Anatomy

The purpose of the lab was to generate a workspace, but as long as we're here let's take a look
at the `workspace/apps/myapp` directory.

- `view/MainContainer.mjs`
- `app.mjs`
- `index.html`
- `neo-config.json`

Application source is in `.mjs` files. These are standard _modular JavaScript_ files
with `import` and `export` statements, and class definitions. Neo.mjs apps have one class 
definition per `.mjs` source file. 

The index file contains a script tag that runs `MicroLoader.mjs`, which is a simple 
file that launches the app based on information found in `neo-config.json`.

Don't worry about the file contents for now: we'll do that in the next lab.

##Flow of Execution

<img src="https://s3.amazonaws.com/mjs.neo.learning.images/FlowOfExecution.jpg" style="width:50%"/>

As you can see, `MicroLoader.mjs` runs `Main.mjs`, which in turn spawns the three web-wokers used by Neo.mjs:

- `neomjs-data-worker` handles Ajax calls and sockets
- `neomjs-vdom-worker` keeps track of the view (and applies delta updates to the main thread)
- `neomjs-app-worker` is where app logic is run

Neo.mjs apps run in multiple webworkers, and each webworker is run in a separate parallel thread.  
Parallel processing &mdash; along wih the efficient way the `neomjs-vdom-worker` applies delta updates &mdash; is why Neo.mjs applications run so fast. 

##Commonly-used Scripts

If you look in the `package.json` script block you'll see several scripts used for generating applications and classes, 
doing builds, and starting a server. We'll use several of them throughout the tutorials.

- create-app &mdash; creates a simple demo app
- create-app-minimal &mdash; creates a application shell with no content
- server-start &mdash; starts a server with webroot set to the workspace
- build-all &mdash; builds minimized versions of your apps
- build-themes &mdash; creates app .css from .scss files found in `resources/scss`
- watch-themes &mdash; creates app .css as you save changes to any app


##Lab. Create the earthquakes starter app

<!-- lab -->

In this lab you'll create a starter app and add a single component.

<details>

<summary>Use the command-line to create a starter app</summary>

Use a terminal window to navigate to the workspace and run the following script. Use "Earthquakes"
as the app name, and defaults for everything else.

    npm run generate-app-minimal

After the script runs yous should see these files in the `app/earthquakes` directory.

`view/MainContainer.mjs`
- `app.mjs`
- `index.html`
- `neo-config.json`

If you look in `neo-config.json` you should see this content. Note the `mainThreadAddons` block 
&mdash; it reflects the add-ons you chose when you followed the instructions in the script.
<pre>
{
    "appPath": "../../apps/earthquakes/app.mjs",
    "basePath": "../../",
    "environment": "development",
    "mainPath": "../node_modules/neo.mjs/src/Main.mjs",
    "mainThreadAddons": [
        "DragDrop",
        "Stylesheet"
    ],
    "workerBasePath": "../../node_modules/neo.mjs/src/worker/"
}</pre>

You're free to edit `neo-config.json` if you were to change your mind later about the theme or need for other add-ons.

If you refresh browser at <a href="http://localhost:8080/apps/" target="apps">http://localhost:8080/apps/</a>
you'll see the new _earthquakes_ app listed, and if you run it you'll see... nothing! That's because the 
minimal starter app is the shell of an application without any view content. We'll add a little content
later in the lab.

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EmptyEarthquakes.png"></img>

</details>

<details>
<summary>Look at the main view source</summary>

Use a code editor and look at `workspace/apps/earthquakes/src/view/MainView.mjs`. You'll see the 
following class definition: 

<pre data-javascript>

import Base        from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Controller  from './MainViewController.mjs';
import ViewModel   from './MainViewModel.mjs';

class MainView extends Base {
    static config = {
        className: 'Earthquakes.view.MainView',
        ntype: 'earthquakes-main',
        
        controller: {module: Controller},
        model: {module: ViewModel},

        layout: {ntype: 'fit'},
        items: [],
    }
}

Neo.applyClassConfig(MainView);

export default MainView;
</pre>

As you can see, `MainView extends Base`, and `Base` is a _container_ (`Neo.container.Base`). 
A container is a component &mdash; it holds other components, specified in `items:[]`. There 
are no items in the starter app. The `layout` config specifies how the items are arranged.

</details>

<details>
<summary>Add a component</summary>

Let's add a button. To do that, add an import for the button base class, then configure it
in the container's `items:[]`. If you were to read the API docs for buttons, you'd see 
that buttons have various configs, such as `text`, which is the button text, `iconCls`, which
is typically a FontAwesome CSS class used to show an icon, and `handler`, which specified
which method to run when the button is clicked. We'll use `text`.

<pre data-javascript>

import Base        from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Button      from '../../../node_modules/neo.mjs/src/button/Base.mjs';
import Controller  from './MainViewController.mjs';
import ViewModel   from './MainViewModel.mjs';

class MainView extends Base {
    static config = {
        className: 'Earthquakes.view.MainView',
        ntype: 'earthquakes-main',

        controller: {module: Controller},
        model: {module: ViewModel},

        layout: {ntype: 'fit'},
        items: [{
            module: Button,
            text: 'Button!'
        }],
    }
}

Neo.applyClassConfig(MainView);

export default MainView;
</pre>


When you run the app you'll see the single button.

<img src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesSingleFitButton.png" style="width:80%"/>

The button takes up the full width. Buttons look different depending on the theme. We're using
the _neo-theme-neo-light_ theme, which controls button height. Otherwise, child items a using the _fit_ layout
take up the full window.
</details>


<details>
<summary>Modify the layout</summary>
The `layout` configures how child items are visually arranged. First, note that the config
specifies `ntype`. We used `module` for the button config. An `ntype` is a class alias &mdash; if a class
has already been imported, you can use the `ntype` rather than importing it again and using the `module`
config. We haven't imported any layouts, but it turns out that `Neo.container.Base` _does_ import all the 
layout types, which means we're always free to use `ntype` with layouts. You're free to specify an `ntype`
for the classes you define.

Let's change the layout to arrange items vertically, with items aligned horizontally at the start.

<pre data-javascript>
layout: {
    ntype: 'vbox',
    align: 'start'
}
</pre>

<img src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesSingleVoxStartButton.png" style="width:80%"/>


</details>

<!-- /lab -->

##Introduction to Debugging

At startup a Neo.mjs application launches three Web Workers:

- neomjs-app-worker
- neomjs-data-worker
- neomjs-vdom-worker

<small>You can configure Neo to launch additional workers, such as a shared app worker.</small>

As a developer, your code is run in _neomjs-app-worker_. When you're debugging,
choose that worker in the DevTools JavaScript context dropdown.

<img width="80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/DevToolsJavaScriptContext.png">

A basic debugging (and coding!) task is getting a referernce to a component.
You can then see and update the component's state and run its methods.

There are a few ways to get a component reference.
- `Neo.manager.Component.items` <tt>// Returns [Component]</tt>
- `Neo.find({property:'value'})` <tt>// Returns [{}] of instances<t/t>
- `Neo.findFirst({property:'value'})` <tt>// Returns first instance</tt>
- Doing a Shift-Ctrl-right-click on a component

Keep in mind that `Neo.manager.Component.items`, `Neo.find()` and `Neo.findFirst()`
are debugging aids _only_, and _should never be used in app logic_.

Why? There's nothing stopping you from using then, and they would work fine,
but those methods completely break encapsulation and scoping principles! Their 
use would make an application brittle and hard to maintain.

Once we have a reference in the debugger console you can inspect and update its
properties, or run its methods. For example, if we have devtools open in the 
`earthquakes` app, then run `Neo.findFirst({ntype:'button'})` from the _neomjs-app-worker_
context, we can inspect the button. 

<img width="80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesFindFirstButton.png">

Once we find the component, we can expand it and scroll down until we see the grayed-out properties &mdash; 
those are setter/getter properties.

We can choose whatever property we're interested in, and click on the ellipses. That runs the getter, and if 
we change the value we'll be running the setter. An obvious button property to change is `text`.
Editing that value is immediately reflected in the view.

<img width="80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesFindFirstButtonChangeText.png">

Or, we can change the property directly via `Neo.findFirst({ntype:'button'}).text = "Hi there!`.

There's an even more convenient way to get a component reference: Doing a Shift-Ctrl-right-click on a component
will show the container hierarchy for the selected component. 

<img width="80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesDemoShiftCtrl.png">

At this point the app is so simple there's not much to see, but in a more complex app you can see the hierarchy
and inspect or update component.


##Lab. Debugging

In this lab you'll get a little debugging practice by getting component references, changing properties, 
and runing methods.

<!-- lab -->

<details>
<summary>Use `Neo.manager.Component.items`</summary>

While running the _earthquakes_ app, open Chrome devtools, choose the _neomjs-app-worker_ JavaScript
context, and run this statement:

    Neo.manager.Component.items

The `items` property is an array of all created components. The array may have a lot of entries, depending on
the complexity of an app and how much you've done while running it. But it's an easy way to explore what's 
been created.

</details>

<details>
<summary>Store as global variable</summary>

Any time you have a object reference in the console &mdash; even if it's nested within an array or object &mdash;
you can right click on the object and choose _Store as global_ variable. Chrome will create a variable named
`temp1`, `temp2`, etc., that references the object. That  can make it easier to inspect the object and run its methods..


<img src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/StoreAsGlobal.png" style="width:80%"/>

</details>


<details>
<summary>Use `Neo.find()` and `Neo.findFirst()`</summary>

If you know what you're looking for, and don't want to bother inspecting everything in `Neo.manager.Component.items`,
you can use `Neo.find()`, passing an object used to match against what you're searching for. 

`Neo.find()` returns an array of matching instances, and `Neo.findFirst()` returns the first matching item. 
Often you know there's only a single instance, so in practice `Neo.findFirst()` is more commonly used.

You could find the button via Neo.find({ntype:'button'}) or Neo.find({text:'Button!'} (assuming you haven't changed
the button's text.) You can even match a property you give the button. For example, if you configured it with a made-up
property `foo:true`, you could find it via `Neo.findFirst({foo:true})`. The point is you can search for any properties
you'd like.

Try this out.

`Neo.findFirst({text:'Button!'}).text = 'Foo!'

You should see the button's text change immediately.

</details>


<details>
<summary>Use `Shift-Ctrl-right-click`</summary>

With your cursor over the button, press _Shift-Ctrl-right-click_. The console will log the button, its parent `MainView`
and the subsequent parent `Viewport. The button reference shows up as `Base` because the button class name is `Neo.button.Base`.

<img width="80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesDemoShiftCtrl.png">

Note that _Shift-Ctrl-right-click_ is only available during development &mdash; it isn't available in a build.

</details>


<details>
<summary>Add a method</summary>

As we mentioned, when debugging, if you a have a reference you can access or update its properties, or run 
its methods. Let's try that out by adding a method.

Edit `apps/earthquakes/view/MainView.mjs` and add a method.

<pre data-javascript>

import Base        from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Button      from '../../../node_modules/neo.mjs/src/button/Base.mjs';
import Controller  from './MainViewController.mjs';
import ViewModel   from './MainViewModel.mjs';

class MainView extends Base {
    static config = {
        className: 'Earthquakes.view.MainView',
        ntype: 'earthquakes-main',

        controller: {module: Controller},
        model: {module: ViewModel},

        layout: {
            ntype: 'vbox',
            align: 'start'
        },
        items: [{
            module: Button,
            foo: true,
            text: 'Button!'
        }],
    }
    doFoo (){
        console.log('foo!');
    }
}

Neo.applyClassConfig(MainView);

export default MainView;
</pre>

Save your changes.

As you can see, the code defined an instance method `doFoo()` that simply logs a message. We'll run the method via debugging techniques in the next step.

</details>

<details>
<summary>Use `Neo.component.Manager.items` to run the method</summary>

On the console run `Neo.component.Manager.items`. Expand the array and right-click on the entry for `MainView` and
choose `Store object as global variable`. Then type `temp1.doFoo()` &mdash; you should see "foo!" being logged.

Remember that you _must_ run console statement in the _neomjs-app-worker_ context, and every time your choose
`Store object as global variable` it'll increment the name of the temp variable: `temp1`, `temp2`, etc.
</details>

<details>
<summary>Use _Shift-Ctrl-right-click_ to run the method</summary>

Now try the _Shift-Ctrl-right-click_ technique. 

With your cursor over the button, do a _Shift-Ctrl-right-click_ &mdash; you'll see the component hierarchy logged. 
As you did in the previous step, right-click on the entry for `MainView` and choose `Store object as global variable`. 
Then run `doFoo()` using that variable.
</details>

<!-- /lab -->

At this point we have a application with minimal content. You also know how to do some debugging. Let's do something more interesting.

##Lab. Fetch earthquakes data and show it in a table

<!-- lab -->

<details>
<summary>Add a table</summary>

Replace the button with a table by replacing `MainView.mjs` with the following content.

<pre data-javascript>

import Base        from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Table       from '../../../node_modules/neo.mjs/src/table/Container.mjs';
import Store       from '../../../node_modules/neo.mjs/src/data/Store.mjs';
import Controller  from './MainViewController.mjs';
import ViewModel   from './MainViewModel.mjs';

class MainView extends Base {
    static config = {
        className: 'Earthquakes.view.MainView',
        ntype: 'earthquakes-main',

        controller: {module: Controller},
        model: {module: ViewModel},

        layout: {ntype: 'vbox'},
        items: [{
            module: Table,
            store: {
                module: Store,
                model: {
                    fields: [{
                        name: "humanReadableLocation",
                    }, {
                        name: "size",
                    }, {
                        name: "timestamp",
                        type: "Date",
                    }],
                },
                url: "https://apis.is/earthquake/is",
                responseRoot: "results",
                autoLoad: true,
            },
            style: {width: '100%'},
            columns: [{
                dataField: "timestamp",
                text: "Date",
                renderer: (data) => data.value.toLocaleDateString(undefined, {weekday: "long", year: "numeric", month: "long", day: "numeric"}),
            }, {
                dataField: "humanReadableLocation",
                text: "Location",
            }, {
                dataField: "size",
                text: "Magnitude",
                align: "right",
                renderer: (data) => data.value.toLocaleString(),
            }],
        }],
    }
}

Neo.applyClassConfig(MainView);

export default MainView;
</pre>

Save and refresh.

<img width="80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesTable.png">


</details>


<!-- /lab -->

##Key Features

The code accomplishes a lot. 

As we discussed before, the app is
- Class-based
- Declarative

The app logic
- Calls a web service
- Populates a store
- Shows store data in a table

Let's review the code and see what it's doing. 

### The store

A store is a collection of records. A record is described in the `model` and the model's `fields`.
Here's the config for the store.

<pre data-javascript>
{
    module: Store,
    model: {
        fields: [{
            name: "humanReadableLocation",
        }, {
            name: "size",
        }, {
            name: "timestamp",
            type: "Date",
        }],
    },
    url: "https://apis.is/earthquake/is",
    responseRoot: "results",
    autoLoad: true,
}
</pre>

The feed looks like this. (For simplicity, some values are omitted.)
<pre data-javascript>
{
    "results": [{
        "timestamp": "2017-10-13T12:07:24.000Z",
        "latitude": 63.976,
        "longitude": -21.949,
        "size": 0.6,
        "humanReadableLocation": "6,1 km SV af Helgafelli"
        }, {
        "timestamp": "2017-10-13T09:50:50.000Z",
        "latitude": 65.124,
        "longitude": -16.288,
        "size": 0.9,
        "humanReadableLocation": "6,1 km NA af Her\u00F0ubrei\u00F0art\u00F6glum"
        },
    ...]
</pre>

The store defines a `type` for the date field. There are a few pre-defined field types that convert 
the value from the feed into what's stored in the store's record. The store specifies the URL for the
data feed, and the store uses `responseRoot` to specify the value in the feed that holds the array
of items.

###The Table

Tables have two key configs: `store` and `columns`. Here's the columns config:

<pre data-javascript>
columns: [{
    dataField: "timestamp",
    text: "Date",
    renderer: (data) => data.value.toLocaleDateString(undefined, {weekday: "long", year: "numeric", month: "long", day: "numeric"}),
}, {
    dataField: "humanReadableLocation",
    text: "Location",
}, {
    dataField: "size",
    text: "Magnitude",
    align: "right",
    renderer: (data) => data.value.toLocaleString(),
}]
</pre>

By default, a column just runs `toString()` on the record property specified in the column's `dataField`.
You can also provide a `renderer`, which is a function you provide to format the value any way you'd like.
In the code above it's using standard JavaScript methods to format the data and magnitude.

## Definining Views as Reusable Components

The way we've coded the app, the grid is _not_ reusable. In other words, if we needed two identical grids we'd 
have to copy-and-paste the same config block.

You can reuse any class config block by creating a new class that extends the component's class. In other words, 
if you want to reuse a table, you create a new class that extends `Neo.container.Table` and uses the same config.

Besides reuse, other good reasons to simplify and modularize your code is to make your views more descriptive and
abstract, and it allows those classes to be tested in isolation.

## Lab. Refactor the Table Into its Own Class

<!-- lab -->

<details>
<summary>Copy the table into its own class</summary>

Create a new file named `apps/earthquakes/view/earthquakes/Table.mjs` with this content.

<pre data-javascript>
import Base from '../../../../node_modules/neo.mjs/src/table/Container.mjs';

class Table extends Base {
    static config = {
        className: 'Earthquakes.view.earthquakes.Table',
        ntype: 'earthquakes-table',
        layout: {ntype: 'vbox'},
        style: {width: '100%'},
        columns: [{
            dataField: "timestamp",
            text: "Date",
            renderer: (data) => data.value.toLocaleDateString(undefined, {weekday: "long", year: "numeric", month: "long", day: "numeric"}),
        }, {
            dataField: "humanReadableLocation",
            text: "Location",
        }, {
            dataField: "size",
            text: "Magnitude",
            align: "right",
            renderer: (data) => data.value.toLocaleString(),
        }],
    }
}

Neo.applyClassConfig(Table);

export default Table;
</pre>

</details>

<details>
<summary>Review the code</summary>

- The class extends `Neo.table.Container`
- It has an `ntype`, which we can use when creating an instance, or when debugging
- Each column has `text` and `dataField` configs, and some have renderers

</details>

<details>
<summary>Use the new component</summary>

Edit `apps/earthquakes/view/MainView` and make these changes. 

- Add `import EarthquakesTable from './earthquakes/Table.mjs';`
- Replace the `module: Table` with `module: EarthquakesTable`
- Remove the `columns:[]` config
- Leave the `store` config alone

Save and refresh the browser, and your app should run as before.

You can confim that the  new class _is being loaded_ by using DevTools to try to open `earthquakes/Table` &mdash; if it
was imported, it'll be listed.

You can confirm that an instance _was created_ by using the DevTools console and searching for it via

    Neo.first('earthquakes-table')

</details>

<details>
<summary>Here's the code</summary>

<pre data-javascript>
import Base             from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import EarthquakesTable from './earthquakes/Table.mjs';
import Store            from '../../../node_modules/neo.mjs/src/data/Store.mjs';
import Controller       from './MainViewController.mjs';
import ViewModel        from './MainViewModel.mjs';

class MainView extends Base {
static config = {
        className: 'Earthquakes.view.MainView',
        ntype: 'earthquakes-main',

        controller: {module: Controller},
        model: {module: ViewModel},

        layout: {ntype: 'vbox'},
        items: [{
            module: EarthquakesTable,
            store: {
                module: Store,
                model: {
                    fields: [{
                        name: "humanReadableLocation",
                    }, {
                        name: "size",
                    }, {
                        name: "timestamp",
                        type: "Date",
                    }],
                },
                url: "https://apis.is/earthquake/is",
                responseRoot: "results",
                autoLoad: true,
            },
            style: {width: '100%'},
        }],
    }
}

Neo.applyClassConfig(MainView);

export default MainView;
</pre>

</details>

<details>
<summary>Why are some things in `MainView` and not in `Table`?</summary>

When we refactored the table into its own class we didn't move all the configs. Both
the width styling and `store` were left in `MainView`. Why?

It's a matter of re-use and what you need in a given situation. By leaving the width specification
outside the table class we're to specify a different value in all the places we're using the table.

Similarly, if the store were in the table class, it would be using that specific store and
each instance of the table would have its own instance of the store. If we want multiple 
instance of the table with each using a different store &mdash; or if
we wanted to share the store with other components &mdash; then it makes sense for the 
store to be outside the table class. 

</details>

<details>
<summary>Make a second instance of the table</summary>

To further illustrate that the table is reusable, let's create a second instance.

Simply copy-and-paste the value in the `MainView` `items` with an identical second item.

Save and refresh and you should see two tables.

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesTwoTables.png"></img>

</details>

<!-- /lab -->

## Shared Bindable Data

The _earthquakes_ app has a problem: even though the table is nicely reusable, we duplicated the config for the store,
and we can't share it. If you were to look at network traffic you'd see that we're also fetching the data
twice. 

If we simply wanted to re-use the store's description we could refactor the store config into a new
store class, just like we did for the table. But in _earthquakes_ we want to share the store _instance_.

Neo has a feature that allows shared, bindable, data. A `Neo.model.Component` instance holds properties that 
can be values like strings, numbers, or even references, like component or store references. `Neo.model.Component`
is commonly called a _view model_ or _component model_.<small><sup>*</sup></small>

The `create-app-minimal` script includes a view model and view controller config. The view model
will hold the store.

<br>
<br>
<br>
<small>* There's a longer write-up on view controllers in the "Getting Started" section.</small>



## Lab. Use a View Model

<!-- lab -->

<details>
<summary>Look at network traffic</summary>

Before making any changes, open devtools in the Network tab and refresh _earthquakes_. You'll see two
calls to the web service.

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesTwoTablesTwoCalls.png"></img>

</details>

<details>
<summary>Copy the store config to the view model</summary>

View models have two key configs: `data` and `stores`. 

- `data` holds name/value pairs where the value can be a simple value, or object references
- `stores` holds configs of stores

Add a `stores` property to the view model config that holds a copy of the store.

<pre data-javascript>

import Base             from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import EarthquakesTable from './earthquakes/Table.mjs';
import Store            from '../../../node_modules/neo.mjs/src/data/Store.mjs';
import Controller       from './MainViewController.mjs';
import ViewModel        from './MainViewModel.mjs';

class MainView extends Base {
    static config = {
        className: 'Earthquakes.view.MainView',
        ntype: 'earthquakes-main',

        controller: {module: Controller},
        model: {
            module: ViewModel,
            stores: {
                earthquakes: {
                    module: Store,
                    model: {
                        fields: [{
                            name: "humanReadableLocation",
                        }, {
                            name: "size",
                        }, {
                            name: "timestamp",
                            type: "Date",
                        }],
                    },
                    url: "https://apis.is/earthquake/is",
                    responseRoot: "results",
                    autoLoad: true,
                },    
            }
        },

        layout: {
            ntype: 'vbox',
        },
        items: [{
            module: EarthquakesTable,
            store: {
                module: Store,
                model: {
                    fields: [{
                        name: "humanReadableLocation",
                    }, {
                        name: "size",
                    }, {
                        name: "timestamp",
                        type: "Date",
                    }],
                },
                url: "https://apis.is/earthquake/is",
                responseRoot: "results",
                autoLoad: true,
            },
            style: {width: '100%'},
        },{
            module: EarthquakesTable,
            store: {
                module: Store,
                model: {
                    fields: [{
                        name: "humanReadableLocation",
                    }, {
                        name: "size",
                    }, {
                        name: "timestamp",
                        type: "Date",
                    }],
                },
                url: "https://apis.is/earthquake/is",
                responseRoot: "results",
                autoLoad: true,
            },
            style: {width: '100%'},
        }],
    }
}

Neo.applyClassConfig(MainView);

export default MainView;

</pre>

In the `stores` config we named the store _earthquakes_. We could have named it anything, like _foo_
or _myStore_. We're calling it _earthquakes_ simply because that seems like a good descriptive name 
of the data the store holds.

At this point we have _three_ identical store configs! Save and refresh, and look at network traffic &mdash; you
should see three calls.

Having an instance in the view model means we can share it. It can be shared anywhere in the containment 
hierarchy. The app doesn't have much of a hierarchy: it's just the main view and two child components (the two
tables). But now that the store is in the parent's view model we can share it.

</details>

<details>
<summary>Use the shared store</summary>

The way to bind an instance to a view model property is with the `bind` config. For example

    bind: {
        store: 'stores.earthquakes' 
    }

binds a `store` property to a store called `foo`. The code is saying _in the future, when the value
of "stores.earthquakes" changes, assign it to this object's "store" property_. In this case, `stores.earthquakes`
starts out undefined, then at runtime within a few milliseconds as the view model is processed, the configured
store is created and a reference is assigned to `stores.earthquakes`. That wakes the binding up, and the 
value is assigned to the table's `store` property. 

Replace each table's `store` config with the binding.

<pre data-javascript>

import Base             from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import EarthquakesTable from './earthquakes/Table.mjs';
import Store            from '../../../node_modules/neo.mjs/src/data/Store.mjs';
import Controller       from './MainViewController.mjs';
import ViewModel        from './MainViewModel.mjs';

class MainView extends Base {
    static config = {
        className: 'Earthquakes.view.MainView',
        ntype: 'earthquakes-main',
        controller: {module: Controller},
        model: {
            module: ViewModel,
            stores: {
                earthquakes: {
                    module: Store,
                    model: {
                        fields: [{
                            name: "humanReadableLocation",
                        }, {
                            name: "size",
                        }, {
                            name: "timestamp",
                            type: "Date",
                        }],
                    },
                    url: "https://apis.is/earthquake/is",
                    responseRoot: "results",
                    autoLoad: true,
                },    
            }
        },

        layout: {
            ntype: 'vbox',
        },
        items: [{
            module: EarthquakesTable,
            bind: {
                store: 'stores.earthquakes'
            },
            style: {width: '100%'},
        },{
            module: EarthquakesTable,
            bind: {
                store: 'stores.earthquakes'
            },
            style: {width: '100%'},
        }],
    }
}

Neo.applyClassConfig(MainView);

export default MainView;
</pre>

Save, refresh, and look at network traffic: you'll see a _single_ call to the web service.

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/EarthquakesTwoTablesOneCall.png"></img>

You can further prove we're using a shared instance by running these statements in the console.

<pre data-javascript>
a = Neo.findFirst({ntype:'earthquakes-main'}).model.stores.earthquakes;
b = Neo.find({ntype:'earthquakes-table'})[0].store;
c = Neo.find({ntype:'earthquakes-table'})[1].store;

(a === b) && (a === c) && (b === c) // true
</pre>

</details>

<details>
<summary>Use the view model class</summary>

We configured the view model in-line, in the `model` config at the top of `MainView`. But the starter app
has a `MainViewModel` class. In theory, if you have a trivial view model you could configure it in-line. But
in general you want to keep that code separate by coding it in a separate class. This is what we did for the 
table config &mdash; we started by coding it in-line in the main view, then we refactored it into its own
class. The result was a simpler and more abstract main view. We want to do the same for the view model.

Since the starter app already provides `MainViewModel`, all we need to do is copy the `stores` property.

Here's the resulting code you should place into `MainViewModel.mjs`.

<pre data-javascript>

import Base   from '../../../node_modules/neo.mjs/src/model/Component.mjs';
import Store  from '../../../node_modules/neo.mjs/src/data/Store.mjs';

class MainViewModel extends Base {
    static config = {
        className: 'Earthquakes.view.MainViewModel',

        data: {},
        stores: {
            earthquakes: {
                module: Store,
                model: {
                    fields: [{
                        name: "humanReadableLocation",
                    }, {
                        name: "size",
                    }, {
                        name: "timestamp",
                        type: "Date",
                    }],
                },
                url: "https://apis.is/earthquake/is",
                responseRoot: "results",
                autoLoad: true,
            },    
        }
    }
}

Neo.applyClassConfig(MainViewModel);

export default MainViewModel;
</pre>

And you need to remove the `stores` config from the main view as follows.

<pre data-javascript>

import Base             from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import EarthquakesTable from './earthquakes/Table.mjs';
import Controller       from './MainViewController.mjs';
import ViewModel        from './MainViewModel.mjs';

class MainView extends Base {
    static config = {
        className: 'Earthquakes.view.MainView',
        ntype: 'earthquakes-main',
        controller: {module: Controller},
        model: {
            module: ViewModel
        },

        layout: {
            ntype: 'vbox',
        },
        items: [{
            module: EarthquakesTable,
            bind: {
                store: 'stores.earthquakes'
            },
            style: {width: '100%'},
        },{
            module: EarthquakesTable,
            bind: {
                store: 'stores.earthquakes'
            },
            style: {width: '100%'},
        }],
    }
}

Neo.applyClassConfig(MainView);

export default MainView;
</pre>

The refactorings to have separate table and view model classes means the code is more modular, more reusable, 
and each class is simpler than using complex source files that try to configure every detail.

</details>

<!-- /lab -->

### Google Maps Add-on

Neo.mjs has a Google Map component. It's a little different than a component like a button or table, becauase
it's implemented as a _main thread add-on_. Ultimately, normal components are responsible for specifying how 
they're rendered (which is usually handled by Neo.mjs).

The reason Google Maps is different because _Google_ is responsible for rendering the map and markers. 
That's done via the Google Maps API, all of which is run in the main application thread. In situatations like
that Neo.mjs wraps up the API, and exposes it to the _neomjs-app-worker_ thread.

How do you choose which main-thread add-ons you want? If you recall the script you used to create the starter
app, it hads a step that asks what add-ons you want. That results in populating the `mainThreadAddons` property
in `neo-config.json`. We didn't choose Google Maps when we ran the script, but we need it. That means we'll
need to edit `neo-config.json` and add it. Google Maps also requires an API key, which is also configured in
`neo-config.json`.

The Google Maps component has two key configs:

- `center:{lat, lng}`
- `store`

The store must have records with these properties:

- `position` &mdash; the location of the marker, of the form `{lat, lng}`
- `title` &mdash; a description of the marker

## Lab. Use the Google Maps Main-thread Add-on

<!-- lab -->

<details>
<summary>Speficy the main-thread add-on</summary>

Edit `apps/earthquakes/neo-config.json` and add entries for the Google Maps add-on and the map key.

<pre data-javascript>
{
    "appPath": "../../apps/earthquakes/app.mjs",
    "basePath": "../../",
    "environment": "development",
    "mainPath": "../node_modules/neo.mjs/src/Main.mjs",
    "mainThreadAddons": [
        "DragDrop",
        "WS/GoogleMaps",
        "Stylesheet"
    ],
    "googleMapsApiKey": "AIzaSyCRj-EPE3H7PCzZtYCmDzln6sj7uPCGohA",
    "themes"          : ["neo-theme-neo-light"],
    "workerBasePath": "../../node_modules/neo.mjs/src/worker/"
}
</pre>

Save and refresh and you'll see a console log eminating from the plugin.

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/earthquakes/GoogleMapsLoaded.png"></img>


</details>

<!-- /lab -->