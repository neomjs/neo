# Workbench Shared UI Prototypes

`examples/workbench/` holds shared Body-layer UI helpers and prototypes consumed across multiple Neo applications and examples before promotion to public `src/` Engine packages (`CodeView.mjs`, `formatConfig.mjs`, `CommandPalette.mjs`, and `CommandActionModel.mjs`).

## Command Palette Prototype (`CommandPalette.mjs`)

`Neo.examples.workbench.CommandPalette` (`ntype: 'workbench-command-palette'`) prototypes a reusable keyboard-first command palette across two distinct applications without coupling to a single app's state model:

- **Palette contract:** Consumers provide eligible labeled actions (`{id, label, group, description, keywords, shortcut, iconCls, available, unavailableReason, managesFocus, handler}`) through `actionProvider({context, palette, windowId})` or `actions`, backed by a `Neo.data.Store` of `Neo.examples.workbench.CommandActionModel` records.
- **Keyboard, pointer & accessibility:** Opens and toggles via `Ctrl+K` / `Meta+K` or `F1` (`CommandPalette.isOpenShortcut(data)`) and consumer trigger buttons; filters live through an ARIA `role="combobox"` input controlling a `role="listbox"` (`aria-activedescendant`); supports `ArrowDown`, `ArrowUp`, `Home`, `End`, `Enter`, `Escape`, trapped `Tab` cycling, and pointer selection; announces match counts and unavailable reasons through `role="status"` (`aria-live="polite"`).
- **Unavailable & empty states:** Empty queries and zero-match filters render explicit messages; available actions sort ahead of unavailable ones (`sorters: [{direction: 'DESC', property: 'available'}]`) so active commands stay immediately reachable while unavailable actions remain visible below with `aria-disabled="true"` and an explicit `unavailableReason` pill, and refuse silent invocation on `Enter` or pointer click while announcing the reason.

### Consumer Integrations

1. **`apps/workstation` (`Workstation.view.Workspace`, `WorkspaceController`, `TourToolbar`):**
   - Exposes real arrangement switches (`Operations`, `Planning`), topology reset (`Reset to default`), Group transaction `Undo` / `Redo`, active-window dock pane focus jumps, guided tour `Start` / `Continue`, and `Light mode` / `Dark mode` theme toggles.
   - Evaluates availability live against `activePerspective`, `dock.perspective.modified`, `TransactionManager.getProvider(topologyGroupId)` (`canUndo` / `canRedo`), `tour.running` / `tour.gatePrompt`, and the invoking `windowId` across both the main workspace window and torn-out popup vessels.
2. **`apps/webdesktop` (`WebDesktop.view.Viewport`, `ViewportController`, `Taskbar`):**
   - Exposes account sign-in (`stores.accounts`), RBAC permission-gated desktop app launches (`stores.apps` + `desktop.openApp()`), `Permissions` simulation panel toggle, `neo-theme-neo-dark` / `neo-theme-neo-light` theme switching, and `Sign out`.
   - When signed out, desktop and app-launch commands remain visible with `"Sign in to an account first"`; when signed in under a restricted account, unpermitted apps report `"Requires <permission> permission"` and refuse execution.

### Limits Found & Graduation Criteria for `src/` Promotion

1. **Main-thread chord `preventDefault` (`Neo.main.DomEvents#registerPreventDefaultKeys`):** `DomEvents` currently keys `preventDefaultKeys` by `(nodeId, event.key)` without modifier predicates (`ctrlKey` / `metaKey` / `shiftKey` / `altKey`). Registering `'k'` would suppress bare `'k'` typing or miss focused child controls, so `Ctrl+K` / `Meta+K` cannot yet call synchronous Main-thread `event.preventDefault()` against browser address-bar shortcuts without adding a modifier-chord registration primitive alongside `F1`.
2. **Multi-window `SharedWorker` attachment (`Workstation`):** Document-level `keydown` listeners on `vnodeId: 'document.body'` attach per window, and moving a floating modal palette across windows requires unmounting from the prior `windowId` before mounting in the invoking `windowId` so focus restoration and `DomEvents` key registrations remain window-local.
3. **Post-action focus survival across async view re-projection:** Dismissing with `Escape` restores `returnFocusId` directly, whereas actions that unmount or re-project the view (`Workstation` arrangement switches or `TransactionManager.undo` / `redo`, `WebDesktop` `Sign in` / `Sign out`) must settle their projection promise (`workspace.refreshPromise`) before probing `returnFocusId` and falling back to `fallbackFocusId` (or yielding to `managesFocus: true`).
4. **Full-viewport modal backdrop vs `.neo-floating` (`Neo.component.Base#floating`):** `floating: true` attaches `.neo-floating`, whose `Global.css` rule parks anchored popovers at `left: -10000px; top: -10000px` until `DomAccess.align()` runs. In applications where `Global.css` cascades at or after equal `(0,1,0)` specificity (`WebDesktop`), `.neo-floating` overrides `inset: 0` and parks a full-screen modal backdrop off-screen; centered modal backdrops belong on `parentId: 'document.body'` with `floating: false`.
5. **Pull-on-open vs live reactive availability while open:** Calling `actionProvider` on `open()` keeps zero idle subscription cost across both apps, and `refreshActions()` updates an open palette explicitly, but asynchronous store or permission mutations occurring *while* the palette stays open require an explicit `refreshActions()` hook or store binding on graduation.
6. **Bounded DOM listbox vs buffered virtualization:** Rendering filtered `CommandActionModel` records directly as `<li role="option">` VDOM nodes scales cleanly for tens of contextual application commands; workspace-wide file or symbol quick-open (1,000+ items) would require `Neo.list.Buffered` backing.
