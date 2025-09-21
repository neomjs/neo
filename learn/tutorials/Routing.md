# Routing

In this tutorial, you'll build a simple single-page application (SPA) with multiple views and learn how to manage
navigation between them using Neo.mjs's built-in routing system.

## Goals

- To understand how to structure a multi-view application.
- To learn how to define and handle client-side routes.
- To use navigation components to trigger route changes.

## Key Concepts

- **View Controllers**: Centralizing the logic for a view, including route handling.
- **Card Layout**: A layout that shows only one child item at a time, perfect for managing different views.
- **Routes Config**: A declarative way to map URL hash fragments to controller methods.
- **Declarative Navigation**: Using the `route` config on buttons to handle navigation automatically.

---

## Lab 1: Creating the Application Shell

In this lab, you'll create the basic structure of our application: a main container that uses a `card` layout to hold
three simple views.

<details>
<summary>Create the Main View</summary>

The `MainView` will be a `Container` with a `card` layout. The `items` array will hold our three "pages": a home view,
an about view, and a contact view. For now, these are just simple components with some text.

```javascript live-preview
import Component from '../../src/component/Base.mjs';
import Container from '../../src/container/Base.mjs';
import Toolbar   from '../../src/toolbar/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Tutorial.Routing.MainView',
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module: Toolbar,
            flex  : 'none',
            items : [
                {ntype: 'button', text: 'Home'},
                {ntype: 'button', text: 'About'},
                {ntype: 'button', text: 'Contact'}
            ]
        }, {
            module      : Container,
            flex        : 1,
            itemDefaults: {module: Component, tag: 'h1'},
            layout      : {ntype: 'card', index: 0},
            reference   : 'main-container',

            items: [
                {text: 'Home View'},
                {text: 'About View'},
                {text: 'Contact View'}
            ]
        }]
    }
}

MainView = Neo.setupClass(MainView);
```

At this point, you should see a toolbar and the "Home View". The other two views exist but are not visible because the
`card` layout's `activeIndex` is `0`. The buttons don't do anything yet.

</details>

---

## Lab 2: Adding a Controller and Routes

Now, let's add the logic to switch between the views. We'll create a `ViewController` and define our routes.

<details>
<summary>Create the View Controller</summary>

We will create a controller class and define a `routes` object. The keys of this object are the URL hash patterns we
want to match (e.g., `#/home`), and the values are the names of the methods in our controller that should be called.

The handler methods will get a reference to our card layout container (using the `reference` we set in Lab 1) and update
its `activeIndex`.

```javascript live-preview
import Component  from '../../src/component/Base.mjs';
import Container  from '../../src/container/Base.mjs';
import Controller from '../../src/controller/Component.mjs';
import Toolbar    from '../../src/toolbar/Base.mjs';

// 1. Define the ViewController
class ViewController extends Controller {
    static config = {
        className: 'Tutorial.Routing.ViewController',
        
        // The routes config maps hash patterns to handler methods
        routes: {
            '/home'   : 'onHomeRoute',
            '/about'  : 'onAboutRoute',
            '/contact': 'onContactRoute'
        }
    }

    onHomeRoute() {
        this.getReference('main-container').layout.activeIndex = 0;
    }

    onAboutRoute() {
        this.getReference('main-container').layout.activeIndex = 1;
    }

    onContactRoute() {
        this.getReference('main-container').layout.activeIndex = 2;
    }
}
ViewController = Neo.setupClass(ViewController);

// 2. Define the MainView
class MainView extends Container {
    static config = {
        className: 'Tutorial.Routing.MainView',
        
        // 3. Attach the controller to the view
        controller: ViewController,

        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module: Toolbar,
            flex  : 'none',
            items : [
                {ntype: 'button', text: 'Home'},
                {ntype: 'button', text: 'About'},
                {ntype: 'button', text: 'Contact'}
            ]
        }, {
            module      : Container,
            flex        : 1,
            itemDefaults: {module: Component, tag: 'h1'},
            layout      : {ntype: 'card', index: 0},
            reference   : 'main-container',

            items: [
                {text: 'Home View'},
                {text: 'About View'},
                {text: 'Contact View'}
            ]
        }]
    }
}

MainView = Neo.setupClass(MainView);
```

Now, if you manually change the URL hash in your browser's address bar (e.g., add `#/about` to the end of the URL),
you will see the view change! The controller is listening for hash changes and updating the UI accordingly.
</details>

---

## Lab 3: Declarative Navigation

Manually changing the hash is not a great user experience. Let's connect our toolbar buttons to the routing system.

<details>
<summary>Use the `route` Config</summary>

Neo.mjs buttons (and other components) have a special `route` config. When you provide a hash string to this config,
the component will automatically change the browser's URL hash when it is clicked.

Let's update the `items` in our `Toolbar`.

```javascript live-preview
import Component  from '../../src/component/Base.mjs';
import Container  from '../../src/container/Base.mjs';
import Controller from '../../src/controller/Component.mjs';
import Toolbar    from '../../src/toolbar/Base.mjs';

class ViewController extends Controller {
    static config = {
        className: 'Tutorial.Routing.ViewController',
        routes: {
            '/myhome' : 'onHomeRoute', // not using '/home' here, since the portal app itself uses it
            '/about'  : 'onAboutRoute',
            '/contact': 'onContactRoute'
        }
    }
    onHomeRoute() {
        this.getReference('main-container').layout.activeIndex = 0;
    }
    onAboutRoute() {
        this.getReference('main-container').layout.activeIndex = 1;
    }
    onContactRoute() {
        this.getReference('main-container').layout.activeIndex = 2;
    }
}
ViewController = Neo.setupClass(ViewController);

class MainView extends Container {
    static config = {
        className : 'Tutorial.Routing.MainView',
        controller: ViewController,
        layout    : {ntype: 'vbox', align: 'stretch'},
        items     : [{
            module: Toolbar,
            flex  : 'none',
            items : [
                // Add the 'route' config to each button
                {ntype: 'button', text: 'Home',    route: '#/myhome'},
                {ntype: 'button', text: 'About',   route: '#/about'},
                {ntype: 'button', text: 'Contact', route: '#/contact'}
            ]
        }, {
            module      : Container,
            flex        : 1,
            itemDefaults: {module: Component, tag: 'h1'},
            layout      : {ntype: 'card', index: 0},
            reference   : 'main-container',

            items: [
                {text: 'Home View'},
                {text: 'About View'},
                {text: 'Contact View'}
            ]
        }]
    }
}

MainView = Neo.setupClass(MainView);
```

Now, clicking the buttons in the toolbar will update the URL hash, which in turn triggers the correct handler in your
`ViewController`, which then switches the active card in your `MainView`. You have a fully functional multi-view application!
</details>

---

## Lab 4: Handling Route Parameters

Often, you need to pass information in the URL, like an ID. The routing system supports this with parameters.

<details>
<summary>Define a Route with a Parameter</summary>

Let's add a "Users" view and a route that can accept a user ID. A parameter is defined in the route pattern using curly
braces: `{paramName}`.

The handler method will receive an object containing the parsed parameters as its first argument.

```javascript live-preview
import Component  from '../../src/component/Base.mjs';
import Container  from '../../src/container/Base.mjs';
import Controller from '../../src/controller/Component.mjs';
import Toolbar    from '../../src/toolbar/Base.mjs';

class ViewController extends Controller {
    static config = {
        className: 'Tutorial.Routing.ViewController',
        routes: {
            '/myhome'      : 'onHomeRoute',
            '/users/{name}': 'onUserRoute' // New route with a parameter
        }
    }

    onHomeRoute() {
        this.getReference('main-container').layout.activeIndex = 0;
    }

    // The 'params' object will contain the value from the URL
    onUserRoute(params) {
        const userView = this.getReference('user-view');
        
        // Update the user view with the parameter
        userView.text = `Displaying profile for: ${params.name}`;

        // Switch to the user view
        this.getReference('main-container').layout.activeIndex = 1;
    }
}
ViewController = Neo.setupClass(ViewController);

class MainView extends Container {
    static config = {
        className : 'Tutorial.Routing.MainView',
        controller: ViewController,
        layout    : {ntype: 'vbox', align: 'stretch'},
        items     : [{
            module: Toolbar,
            flex  : 'none',
            items : [
                {ntype: 'button', text: 'Home',       route: '#/myhome'},
                {ntype: 'button', text: 'User: John', route: '#/users/John'},
                {ntype: 'button', text: 'User: Jane', route: '#/users/Jane'}
            ]
        }, {
            module      : Container,
            flex        : 1,
            itemDefaults: {module: Component, tag: 'h1'},
            layout      : {ntype: 'card', index: 0},
            reference   : 'main-container',

            items: [
                {text: 'Home View'},
                // Add a reference to the user view
                {text: 'Please select a user', reference: 'user-view'}
            ]
        }]
    }
}

MainView = Neo.setupClass(MainView);
```

Now, when you click the "User: John" or "User: Jane" buttons, the `onUserRoute` handler is called.
It receives the name from the URL, updates the content of the user view, and then makes that view active.
</details>

## Summary

Congratulations! You've built a multi-view application and learned the fundamentals of routing in Neo.mjs.

You now know how to:
- Use a `card` layout to manage different application views.
- Create a `ViewController` to handle application logic.
- Define a `routes` config to map URL hashes to controller methods.
- Use the `route` config on buttons for easy, declarative navigation.
- Create dynamic routes that accept parameters from the URL.
