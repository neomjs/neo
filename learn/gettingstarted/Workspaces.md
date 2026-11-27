# Workspaces and Applications

The purpose of this tutorial is to let you see the structure of a Neo.mjs workspace,
and the structure of an application.

If you wish, you can create a workspace by following the directions in the previous topic, _Setup_.

<img src="https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/apps/learnneo/NeoWorkspace.png" style="height: 400px;">

As you can see, a Neo.mjs workspace is a conventional npm package.

## Using the engine outside create-app

A workspace generated with `npx neo-app` already includes the installation steps required by the Neo.mjs engine. If you maintain a package in its own repository and depend on `neo.mjs` without using `create-app`, you must provide the same setup yourself.

The published Neo.mjs engine package contains its source files and build scripts, but not its generated `/dist` output or runtime dependencies. Of the engine's test tree it carries the Playwright configs, `setup.mjs`, `fixtures.mjs` and their helpers, which a workspace's own specs import, and none of the engine's spec files. Its `package.json` declares the tools used by the engine as `devDependencies`. These are not automatically installed when another npm package installs the engine as a dependency.

### Installing the engine

The `create-app` generator writes the following `postinstall` script into the consuming workspace's `package.json`:

```bash readonly
cd node_modules/neo.mjs && npm i && npm run bundle-parse5 && npm run bundle-marked
```

Each part has a specific purpose:

- `cd node_modules/neo.mjs` enters the installed engine package.
- `npm i` installs the engine's own development dependencies, which include the tools required by its build scripts.
- `npm run bundle-parse5` generates the browser dependency bundle for `parse5`.
- `npm run bundle-marked` generates the browser dependency bundle for `marked`.

The two bundles are required because the engine imports `parse5` and `marked` at module scope. They must be generated as part of the installation process.

This command belongs in `postinstall` rather than being a one-time manual setup step. Whenever npm reinstalls the `neo.mjs` dependency, its installed package directory is replaced, including any generated bundles. Running the setup after every installation ensures that the required bundles are available.

For a package maintained outside `create-app`, add the same `postinstall` script and the equivalent engine toolchain `devDependencies` to its own `package.json`. Use the [create-app package generator](https://github.com/neomjs/create-app/blob/main/tasks/createPackageJson.mjs) as the authoritative source for the dependency names and versions rather than maintaining a separate list.

### Lazily loaded browser dependencies

Not every browser dependency needs to be generated during installation.

The engine also supports lazily loaded browser dependencies, including Mermaid, Monaco Editor, and Highlight.js. These can be generated together using:

```bash readonly
npm run bundle-browser-deps
```

This script runs the individual browser dependency bundling tasks, including the `parse5` and `marked` bundles, as well as the additional lazily loaded dependencies.

### Using a linked engine checkout

If `node_modules/neo.mjs` links to a local Neo.mjs checkout instead of a published package, set that checkout up the way the engine's contributors do ([Set up the engine from a clone](https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md#set-up-the-engine-from-a-clone)): `npm i` installs its toolchain, and `npm run bundle-browser-deps` writes the bundles into its `dist/`. Its `npm i` alone creates no bundles, because `dist/` is not in Git. The package does not repeat the nested installation for a linked checkout.

For information about shipping SCSS files with an independently maintained component package, see [Styling and Theming in Neo.mjs](../guides/uibuildingblocks/StylingAndTheming.md#8-theming-in-a-workspace).

## Browsing the workspace

If you run
the script `npm run server-start` from the workspace, Neo.mjs launches a web
server whose doc root is the workspace.

<img src="https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/apps/learnneo/ServerRoot.png" style="height: 400px;">

If you drill down into the `src` directory you'll see your applications.
The `docs` directory holds the Neo.mjs API docs.

For `'pathname'` routing and `spaRoot` / `--no-spa-root` options on `npm run server-start`, see [Local Serving in the Routing tutorial](../tutorials/Routing.md#local-serving-fileservermjs-and-hosting-boundary).

## The structure of a simple app

In order to discuss the structure of an app, we'll create a simple starter
app via this script, run from the workspace. The script prompts for various
application settings.

`npm run create-app-minimal`

At the first prompt, we'll name the app `Foo`, and accept the default for everything else.
The script creates an application structured as follows.

<img src="https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/apps/learnneo/FooFolder.png" style="height: 400px;">

These files are part of the typical structure of a Neo.mjs application. The files `index.html`, `app.mjs`, `neo-config.json`, `view/Viewport.mjs` are rarely modified.
You will, however, edit the main container, and its associated "controller" and "state provider",
as well as create new views classes, their controllers, and other application logic.

## Some source code

Now let's look at a source file. This is the contents of `MainView.mjs`.

```javascript readonly
import Base              from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Controller        from './MainViewController.mjs';
import MainStateProvider from './MainStateProvider.mjs';

class MainView extends Base {
    static config = {
        className: 'Foo.view.MainView',

        controller: {module: Controller},
        stateProvider: {module: MainStateProvider},

        layout: {ntype: 'fit'},
        items: [],
    }
}

export default Neo.setupClass(MainView);
```

Neo.mjs views are composed of components. A component can be a "container", which means it
visually holds or groups other components, or a regular component, like a button. The main
view is a container, which you can see because `MainView extends Base`, and `Base` is
the container base class. The items in a container are configured in the `items:[]`, which
is empty in this starter code.

This view also has a "controller" and a "state provider". We'll talk about those later, but in a nutshell,
a controller is where event handling and app logic goes, and a state provider is where you set up shared
bindable data.

## Adding a button to the view

We'll go into a lot more depth about views, controllers, and state providers in other topics, but to let
you see how a component is configured let's put a button in the container.

First, we need to import the class that defines buttons. Then we'll describe the new button in the
`items:[].`

```javascript readonly
import Base              from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Button            from '../../../node_modules/neo.mjs/src/button/Base.mjs';
import Controller        from './MainViewController.mjs';
import MainStateProvider from './MainStateProvider.mjs';

class MainView extends Base {
    static config = {
        className: 'Foo.view.MainView',

        controller: {module: Controller},
        stateProvider: {module: MainStateProvider},

        layout: {ntype: 'vbox', align: 'start'},
        items: [{
            module: Button,
            text  : 'Button'
        }]
    }
}

export default Neo.setupClass(MainView);
```


Note the entry in `items:[]`. That's a description of the button that will be the single item in our
container. In Neo.mjs terms we're _configuring_ the button. Neo.mjs is a declarative application engine, in
which components and objects are described. It's an abstraction. In other words, the code describes
what we want, but not how it's done. In the code above, we want our container to have one item &mdash;
a button with some text. _How_ that's done isn't important. A non-declarative approach would be more
focused on _how_, where you might way "I want a &lt;button> HTML element with its innerHTML set to
some value."

In another topic you'll learn about the Neo.mjs config system and declaratively describing views,
controllers, and other things.

## A running example

Here's a simplified running example. The `stateProvider` and `controller` are omitted, because they aren't
actually used in the example, and the import root path is different to reflect the location of the
Neo.mjs library relative to the examples.

```javascript live-preview
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'GS.workspaces.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module: Button,
            text  : 'Button'
        }]
    }
}

export default Neo.setupClass(MainView);
```

