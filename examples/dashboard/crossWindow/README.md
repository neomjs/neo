# Cross-Window Dock — named perspectives and the shared-heap pop-out

The pop-out half of the dock showcase. One App Worker drives two render targets: a pane torn out
of this window keeps its live component instance and its committed `dockZone.v1` position, because
the second window is a render target rather than a second application.

Its sibling [`../choreography/`](../choreography/) carries the scripted split/tab/auto-hide tour.

## Run it

```bash
npm install
npm run build-themes -- -n -e dev -t all
npm run server-start
# → http://localhost:8080/examples/dashboard/crossWindow/index.html
```

## Routes

| URL | what boots |
|---|---|
| `index.html` | the workspace with its named perspectives |
| `index.html?popout=<itemId>` | an EMPTY render target — the opener reparents the live pane into it on connect |
| `index.html?workspaceId=demo-b-popup` | the second render target used by the cross-window drag journey |

The empty-host branch belongs to this workspace's own cross-window contract; it travelled here
with `DemoBWorkspace` rather than staying behind in the app the code used to live in.

The named perspectives are data: [`demoBPerspectives.mjs`](./demoBPerspectives.mjs).
