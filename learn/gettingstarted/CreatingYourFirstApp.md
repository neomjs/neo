The purpose of this tutorial is to give you a simple overview of the Neo.mjs workspace and app structure.

## Workspace vs. App

A workspace is the top-level environment. You can think of it as a container that can hold multiple applications. Each application has its own code, but they can all live inside the same workspace.

## Creating a Workspace and App

To create a new workspace, open your terminal and run:

```bash readonly
npx neo-app
```

You’ll be asked to enter a name for the **workspace** — for example, **ecommerce**.  
Next, you’ll be asked to name your first **app** — let’s call it **dashboard**.  
For the remaining questions, you can just accept the default values.

When the setup is complete, Neo automatically launches the development server and opens the workspace in your browser at `http://localhost:8080`.  
From there, you can navigate into the `apps/` folder, open your application, and you’ll find a sample tab container displayed.

If you ever want to start the server again later, just run:

```bash readonly
npm run server-start
```

**Note:**  
You can also create additional apps inside the same workspace later by running

```bash readonly
npm run create-app
```

or

```bash readonly
npm run create-app-minimal
```

The minimal option starts with an empty viewport, while the default option includes a sample tab container.

## Workspace Folder Structure

```bash readonly
ecommerce/
  apps/               # Applications you create live here
  buildScripts/       # Scripts for building bundles
  chroma/
  dist/               # Build output
  docs/               # Documentation files
  node_modules/       # Installed dependencies
  resources/          # Static assets (images, fonts, etc.)
  src/                # Framework source code (neo.mjs core)
  AGENTS.md           # documentation about Neo.mjs Agents
  ServiceWorker.mjs   # Service worker file
  package.json
  package-lock.json
```

## App Folder Structure

```bash readonly
dashboard/
  app.mjs            # Entry point that bootstraps the app
  index.html         # Main HTML file that loads the app
  neo-config.json    # Configuration for the app (name, paths, theme, etc.)
  view/              # Folder for your UI components
    Viewport.mjs     # Root view (main container of the app)
```

## Example: add a custom component

Let’s add a simple button component to our app.  
First, create a new file in the `view/` folder and name it `MyButton.mjs`:

```javascript readonly
import Button from "../../../node_modules/neo.mjs/src/button/Base.mjs";
import Container from "../../../node_modules/neo.mjs/src/container/Base.mjs";

class MyButton extends Container {
  static config = {
    className: "GS.workspaces.MyButton",
    layout: { ntype: "vbox", align: "start" },
    items: [
      {
        module: Button,
        text: "Button",
      },
    ],
  };
}

export default Neo.setupClass(MyButton);
```

This component is just a **container** that holds a single **button**.

Now open `Viewport.mjs` and import the new component.  
Add it to the `items` array right after the `TabContainer`:

```javascript readonly
import BaseViewport from "../../../node_modules/neo.mjs/src/container/Viewport.mjs";
import Component from "../../../node_modules/neo.mjs/src/component/Base.mjs";
import TabContainer from "../../../node_modules/neo.mjs/src/tab/Container.mjs";
import MyButton from "./MyButton.mjs";

class Viewport extends BaseViewport {
  static config = {
    className: "dashboard.view.Viewport",
    layout: { ntype: "fit" },
    items: [
      {
        module: TabContainer,
        height: 300,
        width: 500,
        style: { flex: "none", margin: "20px" },

        itemDefaults: {
          module: Component,
          cls: ["neo-examples-tab-component"],
          style: { padding: "20px" },
        },

        items: [
          {
            header: {
              iconCls: "fa fa-home",
              text: "Tab 1",
            },
            text: "Welcome to your new Neo App.",
          },
          {
            header: {
              iconCls: "fa fa-play-circle",
              text: "Tab 2",
            },
            text: "Have fun creating something awesome!",
          },
        ],
      },
      {
        module: MyButton,
      },
    ],
  };
}

export default Neo.setupClass(Viewport);
```

### How It Works

Neo.mjs views are built from components. Some are **containers** (they can hold other components), and some are **regular components** (like buttons or tabs).  
`Viewport` here is a container (`extends BaseViewport`), and inside it we declare its child components in the `items: []` array.

In this example, the `Viewport` has two children:

1. **TabContainer**:
   A container with two tabs (`Tab 1` and `Tab 2`), each with its own header and content.

2. **MyButton**:
   your custom component that contains a single button

**Summary:**  
This `Viewport` holds **two children** — a tabbed UI and your own component.
