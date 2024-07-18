In this lab you'll create a starter app and add a single component.

<details>

<summary>Use the command-line to create a starter app</summary>

Use a terminal window to navigate to the workspace and run the following script. Use "Earthquakes"
as the app name, and defaults for everything else.

    npm run create-app-minimal

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

import Base       from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Controller from './MainViewController.mjs';
import ViewModel  from './MainViewModel.mjs';

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

Neo.setupClass(MainView);

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
is typically a FontAwesome CSS class used to show an icon, and `handler`, which specifies
which method to run when the button is clicked. We'll use `text`.

<pre data-javascript>

import Base       from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Button     from '../../../node_modules/neo.mjs/src/button/Base.mjs';
import Controller from './MainViewController.mjs';
import ViewModel  from './MainViewModel.mjs';

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

Neo.setupClass(MainView);

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
