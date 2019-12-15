# The neo.mjs vision

At this point I (Tobias) can not commit to adding dates to the planned items.
After investing 1.5 years of my full and unpaid working time I am in need to make up on the financial side of things.
So as long as the project is not properly funded, I can only afford to continue working on it in my spare time.

To speed up the current development there are two options:
1. Help promoting neo.mjs or jump in as a contributor (see <a href="../CONTRIBUTING.md">Contributing</a>)
2. Jump in as a sponsor to ensure I can spend more time on the neo.mjs coding side (see <a href="../BACKERS.md">Sponsors & Backers</a>)

The following items are ***not*** ordered by priority. In case certain topics are important to you, please use the issues
tracker to create an awareness (like / comment on current tickets or create new ones as needed).

Thanks for your support!

* Real World app version 2
    1. Version 1 is definitely worth a look to see how to craft custom components and connect to an API,
    but it is not the best starting point to see how to craft an neo.mjs app. Since the requirement was to use a given
    Bootstrap theme, only component.Base is in use (since more advanced components require a neo.mjs CSS theme).
    At this point I recommend to take a look at the Docs app to learn how to craft an neo.mjs app.
    2. Version 2 is intended to fill this gap and will not use the Bootstrap based theme.
    3. This allows us to use the full range of neo.mjs components (Toolbar, Button, List, TabContainer, Gallery, Helix, etc.)
    4. Once this app is finished, it will be the perfect starting point to learn how to use neo.mjs,
    so right now this item has the highest priority for me.
    5. The RW2 app requires a 3rd neo.mjs theme => based on the conduit styles
    6. Add the ability to switch themes inside the app
* Drag & Drop (see <a href="https://github.com/neomjs/neo/issues/16">#16</a>)
    1. This ticket is definitely an epic, since DD operations happen inside the main thread, while the handlers will
    live inside the app thread.
    2. Once DD is in place, we can create a real slider component (see <a href="https://github.com/neomjs/neo/issues/18">#18</a>)
    3. We can create Dialogs (Windows), which can get moved and resized (see <a href="https://github.com/neomjs/neo/issues/15">#15</a>)
    4. We can create sortable tabs (see <a href="https://github.com/neomjs/neo/issues/23">#23</a>)
* Docs App version 2
    1. I am not planning to re-create the existing app, but enhance it with more features:
    2. Support for showing mixins inside the class views (<a href="https://github.com/neomjs/neo/issues/99">#99</a>)
    3. Add tooltips (especially for the Configs, Methods & Events buttons => navigation shortcut)
    4. Expandable class member items (add the ability to expand or collapse items to make the list shorter)
    5. Writing more guides
    6. Enhance the example views:
        1. The example components should get shown inside a tabContainer: first tab containing the component,
        second tab a source code view of the example
        2. It should be possible to export the current configs (e.g. 3rd tab, configs as JSON)
        3. The configuration container should be collapsible (using a sliding animation)
        4. Add a second tab to the config area to show theme css4 vars and make them changeable
    7. class member inheritance: when overriding a config or assigning a value to a parent one, the parent config
    should get listed (including its initial value)
* Build Scripts
    1. The current scripts work fine inside the neo repository. Since neo.mjs can now get used as a node module,
    enhancements feel necessary.
        1. An npx create-app script (see <a href="https://github.com/neomjs/neo/issues/90">#90</a>)
        2. The build-my-apps scripts should work as well, when used outside of the repo (manually hacked this into the
        Real World app version 1)
* Mobile Support
    1. Add touch based events (swipe, long-tap, etc.) to the global domListeners
    2. Split the current events into desktop & mobile and add a Neo.config to choose which ones to use
    3. Use the events based on the browser feature detection
    4. Create new components and adjust current ones to better work on mobile
* Mobile Docs App
    1. Create a new UI or make the current one responsive
* Make the Data worker more meaningful
    1. Right now, the data worker only executes the XHR requests
    2. Rich originally planned to let stores live inside this thread, but this would create a lot more async logic inside
    the app thread, plus it does not make sense for stores with little data
    3. What should be possible: for remote stores which need to parse the data getting back from an API, these transformations
    should happen inside the app thread (like a data reader)
    4. Remote stores with local sorting: this sorting could happen inside the data worker as well
* Data Package version 2
    1. The collection class is already very powerful (needs some polishing though). For the first version of the data
    package, stores were extending collection.Base. Afterwards records were introduced (not instances of data.Model,
    but a super lightweight extension of a JS Object). At this point, stores should no longer extend a collection,
    but use one instance instead (e.g. a collection config).
    2. More polishing of Sorters & Filters & add the ability for stores to sort & filter per remote (adding params to
    each request).
    3. Enhance the API for stores: when using a collection, several methods need to get bound to the collection, but
    ensuring that data objects get transformed into records.
    4. use data fields: each store should exactly use one instance of data.Model. Inside a model, you can define fields.
    Fields should either be a singleton or a class with static methods. We need to provide parsing methods, e.g. toString()
    for a field type "String".
* Finish the implementation for Tooltips; Rectangle utility class (see <a href="https://github.com/neomjs/neo/issues/51">#51</a>)
* Finish the implementation for form.field.Chip (see <a href="https://github.com/neomjs/neo/issues/31">#31</a>)
* Create a coding style guide (see <a href="https://github.com/neomjs/neo/issues/93">#93</a>)
* Virtual Dom Engine enhancements
    1. Add a 2nd mode where ids do get ignored (e.g. for comparing content on fixed positions like grid rows)
    2. Add an option to specify the the tree depth to compare (e.g. only the first level for containers)
    3. Refactor vdom.Helper: createDeltas
* Create a buffered Grid
    1. So far I mostly focused on table.Container. Since tables are not good for buffering (too many layout reflows),
    it is time to pick up the grid.Container implementation again.
    2. The grid.Container will use divs only. grids need a rowHeight config, since it has to be fixed for buffering.
    3. Add 1-2 more rows as the visible area can show and adjust the content when scrolling (move the top row div to
    the bottom or vice versa)
    4. when clicking on the scrollbar, adjust the full grid cell content
    5. add column reordering via DD (relies on the DD implementation)
    6. add cell-editing
    7. add action columns
    8. add buffering for horizontal scrolling as well
* Create a Router
* Enable neo.mjs to run in node
    1. There are some uses of "self", which work fine inside the main thread & inside the worker scope, but not in node
* neo.mjs based middle-ware (see <a href="https://github.com/neomjs/neo/issues/19">#19</a>)
* Enhance the Siesta tests to run inside a node env
* Write more tests (Epic!)
* main.mixins.FeatureDetection
    1. Add meaningful checks for relevant features
        
Copyright (c) 2015 - today, Tobias Uhlig & Rich Waters