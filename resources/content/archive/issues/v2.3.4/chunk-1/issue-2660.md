---
id: 2660
title: Add support for microfrontend mounting at runtime
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2021-07-30T14:25:36Z'
updatedAt: '2021-08-13T11:11:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2660'
author: dberardo-com
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-08-13T11:11:07Z'
---
# Add support for microfrontend mounting at runtime

**Is your feature request related to a problem? Please describe.**
We are developing our web based applications using the microfrontend design pattern. In practice we have developed a webpack suite that builds Jquery or React based mini-UIs into a well defined API. This API can then be used in other applications (currently tested with angular and reactjs environments) to mount those applications at runtime.

It would be nice to know if neo.mjs supports such kind of pattern, this way one would be able to program components using React and embed those into neo.mjs using some kind of wrapper for managing the state inside neo.mjs

## Timeline

- 2021-07-30T14:25:36Z @dberardo-com added the `enhancement` label
### @tobiu - 2021-07-30T15:26:20Z

Hi @dberardo-com,

it is definitely possible to use external components within neo or the other way around. Just keep in mind that all neo related apps / components live within the application worker, while external components live within a main thread.

**An easy way to test it:**
You could include the JS & CSS output of your build(s) into the index.html file of a neo app.
I recommend to register the top level node as a webcomponent:
https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements

Once you have a custom tag name, you can use this one inside the virtual dom markup of a neo component.

Example:
```
vdom: {
    tag: 'my-component',
    customAttribute: 'foo'
}
```

You can then dynamically change custom attributes at run time.

**A better way to implement it:**
Take a look at the main thread addons:
https://github.com/neomjs/neo/tree/dev/src/main/addon (e.g. AmCharts)

You can create an own main thread addon and include it into your neo app (inside the neo-config.json file).

You can register methods as remotes, so that you can call them as promises from within the application worker.

E.g.:
```
Neo.main.addon.AmCharts.updateData({
    appName : me.appName,
    data    : value,
    dataPath: me.dataPath,
    id      : me.id
});
```

Now you could dynamically import your JS & CSS files as needed and also create methods to create instances of your external components on your own or call methods on your instances (depending on your API).

**Neo Micro Frontends:**
For neo related apps, micro frontends are in place. E.g. you create a neo workspace using `npx neo-app`for your app. Then you create a second workspace where you e.g. create a component.

Then you can add the second workspace as a dependency into the package.json of the first one and statically or dynamically import the widget(s) into your app.

I did not finish the support for nested workspace based theming yet (please let me know if this is a topic of interest), but on the JS side, webpack will handle the split chunks correctly.

Feel free to join the slack channel for more input!

Best regards,
Tobias

### @dberardo-com - 2021-07-31T07:51:34Z

Hi Tobias, thanks for the thorough answer. 

I am still very new to neo.mjs that's why i was just asking some preliminary questions to see how though would be to migrate a "Dashboard based, Reactjs application" into neo.mjs. 

Our dashboard modules use Microfrontend logics and also communicate with one another using both events and callbacks, but those are plain JavaScript concepts, so not linked to any specific framework.

I understand neo.mjs as more Angular-like as React, and in this sense i would have to get used to it first before diving into making a Proof-of-concept prototype.

Let's assume that i manage to migrate all microfronted (JQuery and React) logics into neo.mjs, would the app still benefit of the advantages of neo..mjs (drag and drop between different windows, state bind/ event propagation between windows, high rendering performance, etc?) or are those perks only available for native neo.mjs component?

P.S. i will check out the slack channel

Schönes Wochenende dir!


### @tobiu - 2021-07-31T12:33:46Z

What I would do:
Explore the src folder first, to get an impression which components are already in place. E.g. if you have custom components for basic stuff like buttons, toolbars, fieldsets etc., you could just use the neo counterparts and adjust the styling as needed.

In case you created components where you think: "this one is missing, but could be really useful for others", feel free to open feature requests.

For a PoC, I would keep it simple: You could create a main thread addon and create wrapper components for 1-2 of your widgets (I'd pick easy ones). I would also rewrite one (also simple) component in neo, since it is a good learning experience.

For the wrapper (web)components: your external widgets could communicate as before inside a main thread. I would add listeners to all relevant events inside the new main thread addon and the handlers there could either fire a custom dom event or send a post message to the app worker as if there was a custom dom event (I can help on this part or create an example).

Once your neo component (wrapper) receives the event, you can fire an event with the same name within the app worker, so that other neo based components can subscribe to it.

Obviously it makes sense to use / create as many neo components as possible, but depending on the amount of your micro frontends, this could take time.

One advantage is that neo components create split chunks for the dist/prod env, so the file size will go down.

Regarding the performance: There is still a benefit with using web components, but the benefit gets bigger the more components fully live within the application worker. The delta updates get piped through a read / write queue using requestAnimationFrame, while webcomponents have their own logic to adjust the dom. Unless external widgets would use the same queue for dom updates, it is a bit slower.

Regarding moving component trees across browser windows (this includes drag&drop):
When I move e.g. the helix or gallery from the shared covid app demo into a different window, we just need to move the dom output itself. The helix or gallery JS instances will stay alive (inside the shared app worker) and just gets new dom events from a different window, which does not make a difference.

When moving a MapboxGL map or an AmChart into a new window, we can still move the component tree around the same way. However, the external lib instances live within a main thread. Meaning: the new window needs to use the relevant main thread addons as well and once the dom tree gets mounted, create new JS based instances inside the new main thread (browser window).

I strongly recommend to start with a SPA and implement as much as possible in there, since it does make the debugging easier (for dedicated workers, you get console logs of all workers within the browser window dev tools, while you need a separate console window for each shared worker). You can switch to a shared workers setup if needed at any point in time (the API stays the same).

Side note: While dedicated workers (SPAs) work in all major browsers, shared workers (multi window apps) are not supported inside WebKit (Safari) yet. The related ticket got changed to "in radar" and the team is waiting for more feedback:
https://bugs.webkit.org/show_bug.cgi?id=149850

I recommend to use a native wrapper (e.g. electron) using a headless chromium for this use case.

Ebenfalls ein schönes Wochenende!

### @tobiu - 2021-08-13T11:11:07Z

@dberardo-com 
https://tobiasuhlig.medium.com/using-material-web-components-within-the-neo-mjs-application-worker-50d3790ea48?source=friends_link&sk=2bca9de4a3ba98b693e7582dcc55a990

I guess we can close this ticket now ;)

- 2021-08-13T11:11:07Z @tobiu closed this issue

