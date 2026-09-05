# Workstation — Living Docking Showcase

Workstation is Neo.mjs's standalone dense-workspace flagship: twenty live panes, a renderer-rich
100,000-record grid, a capped feed ingesting ten records per second, real tab overflow, semantic
split-and-return docking, and a deterministic tour across dark and light themes.

It is an independent application under `apps/workstation/` with its own boot surface and theme.

## Run it

```bash
npm install
npm run build-themes -- -n -e dev -t all
npm run server-start
# → http://localhost:8080/apps/workstation/index.html
```

The non-interactive theme build creates the ignored development CSS and `theme-map.json`
artifacts a fresh checkout does not contain.

Press **Start dense tour**. The screenplay opens the real overflow menu, scrolls the 100k grid,
promotes a live pane through `splitNode`, returns it through `addTab`, and flips both themes.
Pane, store, component, and relevant DOM identities remain stable while the layout changes.

The data-only screenplay lives in `apps/workstation/tour/denseWorkstation.mjs`; the mounted
whitebox journey is the runtime and visual falsifier.

## Save and reopen a workspace

**Save workspace** stores the complete keyed topology in IndexedDB, separately from undo history.
Each logical root has its own collection. Cold boot uses its saved active layout; `?layout=<id>`
explicitly selects another record in that collection. An unusable selection offers **Start a new
workspace**, which preserves the saved collection and creates a new root.

Saved window documents hydrate before presentation. **Open … as window** requests a popup from
the button click; **Show … here** presents the same document in the root if a popup is unavailable.
Reloading a root or a restored popup while its SharedWorker survives reuses the live Workspace,
host and pane instances without replaying history or writing a new topology.

**Close workspace** waits for a current durable save, clears its windows' session carriers, and
ends each render target. Browser-owned tabs that cannot close return to a blank document. The
Group keeps its existing reconnect lease and only retires after storage acknowledges current
truth and no retained reference remains. A failed final write keeps a `headless-dirty` Group and
retries instead of discarding its documents.
