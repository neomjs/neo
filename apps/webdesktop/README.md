# Web Desktop — navigation that follows permissions

Sign in as one of four demo accounts, and the desktop offers exactly the apps that account may use: the launcher
icons, the start menu and its submenus. Open **Permissions** to grant or revoke a permission on the live session,
and watch every view follow.

## Run it

```bash
npm install
npm run build-themes -- -n -e dev -t all
npm run server-start
# → http://localhost:8080/apps/webdesktop/index.html
```

## The pattern

Permissions are state, navigation is data, and visibility is one filter.

| Piece  | Where                                         | Role |
|--------|-----------------------------------------------|------|
| State  | `view/ViewportStateProvider.mjs`              | Holds the signed-in `account` and its `permissions`, and writes `permissions` into the apps store's filter. |
| Data   | `store/Apps.mjs`                              | One `Neo.data.TreeStore` with every app and group. Each app names the permission it needs; groups name none. |
| Filter | `store/Apps.mjs`                              | `{property: 'permission', operator: 'included', value: <granted keys>, includeEmptyValues: false}` |
| Views  | `Neo.desktop.Launcher`, the start button's menu | Bound to the apps store. They render what it keeps and never read a permission. |

Signing in is one write (`view/ViewportController.mjs`):

```javascript
this.setState({account: record, permissions: [...record.permissions]})
```

The start menu is a `Neo.menu.List` driven by the same tree store, so every submenu level reads the same filter.
No component exists per permission, and no view carries a copy of the rule.

Two details make it correct:

- **Groups carry no permission.** Tree-store filtering keeps a node when one of its descendants matches, so a group
  appears exactly when it has an app to offer. A group that matched by itself would keep its whole subtree, so a
  permission on a group would expose every app inside it.
- **`includeEmptyValues: false`.** By default, an empty filter value turns a filter off. Without this flag, an
  account with no permissions would see every app.

Hiding UI is not authorization. The backend must check every permission on its own endpoints; this filter only
decides what the UI offers.

## Windows

Double-click an icon, or press Enter on it, and the app opens in a window that grows out of the icon. The window is
a `Neo.dialog.Base`, opened by the engine's `Neo.desktop.WindowManager`: one window per app, loaded on first use
through a lazy `import()` and kept afterwards (`view/ViewportController.mjs`):

```javascript
me.windowManager = Neo.create(WindowManager, {
    appStore    : apps,
    taskStore   : me.getStore('tasks'),
    windowClass : () => import('./AppWindow.mjs'),
    windowConfig: record => me.getWindowConfig(record)
})
```

A floating dialog sits outside the component tree, so the window config names the desktop's state provider as its
window's parent: the window binds `app` from its own provider and `account` from the parent. The manager keeps the
`tasks` store the taskbar lists, orders the windows of this desktop, and closes the window of an app the permission
filter drops, minimized or not. A sign-out calls its `reset()`.

## Arranging icons

Drag an icon before or after another icon of its group, or press Ctrl+Shift+Left or Right (Cmd+Shift on macOS). The
launcher is the engine's `Neo.desktop.Launcher`, draggable through `Neo.draggable.list.SortZone`: during the drag only
the view previews the new order, and a drop writes the apps' `order` field once (`store.updateRows()`). The apps store
(`Neo.desktop.store.Apps`) sorts by `order`, so the launcher and the start menu follow. The filter never touches
`order`, so a permission change keeps the remaining icons in place. A sign-in hands the launcher the account's
`arrangementKey` before the grants: the launcher restores that account's arrangement from `localStorage`, holds its
render until it is in place, and saves each new order under the key.

## Phones and touch

Below 600px the taskbar shows icons only, keeping each control's accessible name, the permission panel becomes a sheet
over the workspace, and every window fills the area above the taskbar. A touch device (`Neo.config.hasTouchEvents`)
has no double-click, so a single tap opens an app there.

## Files

| File | Responsibility |
|---|---|
| `resources/data/accounts.json` | The "backend": demo accounts and their permission keys, read through a store `url`. |
| `store/Apps.mjs`, `model/App.mjs` | The navigation tree's catalog and its permission filter, over the engine's `Neo.desktop.store.Apps` and `Neo.desktop.model.App`. |
| `store/Permissions.mjs`, `view/PermissionList.mjs` | The panel that simulates the backend changing permissions. |
| `view/SignIn.mjs`, `view/AccountList.mjs` | The lock screen. |
| `view/Desktop.mjs`, `view/Taskbar.mjs` | The signed-in desktop, around the engine's `Neo.desktop.Launcher`. |
| `view/AppWindow.mjs`, `view/AppView.mjs` | An app's window and its content. |
| `view/TaskList.mjs` | The open windows in the taskbar, from the engine's `Neo.desktop.store.Tasks`. |
