# Workstation — Living Docking Showcase

Workstation is Neo.mjs's standalone dense-workspace flagship: twenty live panes, a renderer-rich
100,000-record grid, a capped feed ingesting ten records per second, real tab overflow, semantic
split-and-return docking, and a deterministic tour across dark and light themes.

It is an independent application under `apps/workstation/` with its own boot surface and theme.

## Run it

```bash
npm install
npm run server-start
# → http://localhost:8080/apps/workstation/index.html
```

Press **Start dense tour**. The screenplay opens the real overflow menu, scrolls the 100k grid,
promotes a live pane through `splitNode`, returns it through `addTab`, and flips both themes.
Pane, store, component, and relevant DOM identities remain stable while the layout changes.

The data-only screenplay lives in `apps/workstation/tour/denseWorkstation.mjs`; the mounted
whitebox journey is the runtime and visual falsifier.
