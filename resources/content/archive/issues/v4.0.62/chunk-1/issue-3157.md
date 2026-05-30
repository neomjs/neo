---
id: 3157
title: src/main/addon in workspace directory
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2022-06-15T15:42:37Z'
updatedAt: '2022-07-03T05:18:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3157'
author: Dinkh
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-03T05:18:51Z'
---
# src/main/addon in workspace directory

I would like to add a main thread addon to a project / app.

Currently I have to add a new file to neoSrc.main.addon for some functioniality.
It would be cool to be able to add this to appFolder.main.addon


## Timeline

- 2022-06-15T15:42:37Z @Dinkh added the `enhancement` label
- 2022-06-15T15:43:11Z @Dinkh changed title from **mainThread addon Feature Request ViewModel Store listener im Controller auflösen** to **main/addon in App folder**
### @tobiu - 2022-06-17T09:41:14Z

some thoughts on my end:
for consistency reasons as well as from a logical perspective, main thread addons should not live within the app folder(s).

so my idea for this one is: `workspace/src/main/addon/XYZ.mjs`.

now the tricky part: we add main thread addons within the `neo-config.json` files => string based. we do not want to try a dynamic import on framework level and in case it fails, try the workspace based scope. not needed requests make little sense.

to keep the current API, my idea would be to add a prefix for workspace based addons. example (within the config file):
```
"mainThreadAddons": ["DragDrop", "Stylesheet", "workspace/MyAddon"]
```

using the `workspace/` prefix, it would be clear that this file needs to get dynamically imported from the workspace scope. we would need to adjust the program options (help) and document how to use it.

thoughts?

### @Dinkh - 2022-06-17T10:41:15Z

Very cool idea.

In addition we could add package, so that different apps can go for the same components.
How about packages as in ExtJS packages.

We add a folder to the workspace, named packages and in the neo-config.json you can add 

```
"packages": ["myPackage"]
```

This comes with it's own NameSpace and is usage from all apps.
If we go that way we can add the addons to a package, which includes all addOns?

thoughts?

### @tobiu - 2022-06-17T11:33:50Z

ok, i take it as a yes for the `workspace/` prefix :)

one hint: you need to stop thinking in legacy tech. a neo workspace already is a npm package. you can simply add a dependency inside one workspace (`package.json`) to add another workspace.

you could / should create components inside the source folder there and you can create demo-apps to show how to use your custom components (or other classes) there as well.

nested workspace based theming is not supported yet. i mentioned this one inside one of my blog posts. in case there is no ticket for this one created yet, feel free to add it.

- 2022-07-03T05:16:03Z @tobiu changed title from **main/addon in App folder** to **src/main/addon in workspace directory**
- 2022-07-03T05:16:42Z @tobiu referenced in commit `55cb6c4` - "src/main/addon in workspace directory #3157"
### @tobiu - 2022-07-03T05:18:51Z

implementation done. shortened the prefix to /WS.

example usage:
`mainThreadAddons: ['DragDrop', 'Stylesheet', 'WS/MyAddon']`

- 2022-07-03T05:18:51Z @tobiu closed this issue

