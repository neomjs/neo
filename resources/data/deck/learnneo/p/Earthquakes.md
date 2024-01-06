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

##Advice

A word of advice: Keep a high-level perspective, especially early on. Throughout this
tutorial, and others, We'll have plenty of time to get into the code, and we'll do 
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
as the app name, and <b>when prompted for "Main thread add-ons" choose GoogleMaps</b> (using arrow
keys and the space bar to toggle add-on options). Use defaults for everything else.

    npm run generate-app-minimal

After the script runs yous should see these files in the `app/earthquakes` directory.

`view/MainContainer.mjs`
- `app.mjs`
- `index.html`
- `neo-config.json`

If you look in `neo-config.json` you should see this content. Note the `mainThreadAddons` block 
&mdash; it specifies the default add-ons, as well as the GoogleMaps add-on you specified.
<pre>
{
    "appPath": "../../apps/myapp/app.mjs",
    "basePath": "../../",
    "environment": "development",
    "mainPath": "../node_modules/neo.mjs/src/Main.mjs",
    "workerBasePath": "../../node_modules/neo.mjs/src/worker/",
    "themes": [
        "neo-theme-neo-light"
    ]
}
</pre>

When the script finishes you should see 

You'll be propted for a workspace name, starter app name, etc &mdash; accept the default for everything.
As the command finishes it starts a server and opens a browser window.
</details>

<details>
<summary>Look at the main view source</summary>

</details>

<details>
<summary>Add a component</summary>

</details>


<details>
<summary>Start the server</summary>

</details>

<!-- /lab -->

##Introduction to Debugging

##Lab. Debugging

In this lab you'll get a little debugging practice by getting component references, changing properties, 
and runing methods.

<!-- lab -->

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