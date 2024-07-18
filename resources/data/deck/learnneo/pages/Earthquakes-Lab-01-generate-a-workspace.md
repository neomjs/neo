In this lab, you'll generate a Neo.mjs workspace and run the starter app.

<details>
<summary>Wait!</summary>
You may already have a workspace! If so, you can skip this lab. For example, if you followed the <a href="#/learn/Setup">Getting Started > Setup</a> topic, above, you should already have a workspace.

If you don't have a workspace, then continue on to the next step.
</details>

<details>
<summary>Use the command-line to generate the workspace</summary>

Use a terminal window to navigate to some parent folder, 
then run 

    npx neo-app@latest

You'll be prompted for a workspace name, starter app name, etc &mdash; accept the default for everything.
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
