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
    3. This allows us to use the full range of neo.mjs components (Toolbar, Button, List, TabContainer, Helix, etc.)
    4. Once this app is finished, it will be the perfect starting point to learn how to use neo.mjs,
    so right now this item has the highest priority for me.
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
    1. 
        
Copyright (c) 2015 - today, Tobias Uhlig & Rich Waters