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
| Views  | `Neo.desktop.Launcher`, the start menu        | Bound to the apps store. They render what it keeps and never read a permission. |

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

## The desktop

The signed-in screen is the engine's `Neo.desktop.Container`: the launcher, the taskbar with its start menu and the
open apps, and the app windows. The [Web Desktops guide](../../learn/guides/uibuildingblocks/WebDesktops.md) explains
that shell: its windows and their order, the icon arrangement, and its layout on phones and touch devices. The demo
hands it the apps store and adds its own parts by key (`view/Viewport.mjs`):

```javascript
{
    module       : Desktop,
    bind         : {appStore: 'stores.apps', hidden: data => !data.account},
    items        : {workspace: {items: {permissions: {module: PermissionPanel, weight: 30}}}},
    taskbarConfig: {module: Taskbar},
    appWindowConfigs: {
        mail: {height: 520, width: 880, view: () => import('./apps/Mail.mjs')}
        // one entry per app
    }
}
```

What the demo adds to the shell:

- **Each app's view** lives under `view/apps/` and loads on the app's first open. The desktop names itself the
  window's parent, so a view reaches the demo's state provider: Settings binds the account, the theme and the
  permissions, and Documents and the Recycle Bin share the provider's `documents` and `recycleBin` stores, so a delete
  or a restore moves a file between two windows.
- **Each account keeps its own icon arrangement.** A sign-in hands the launcher the account's `arrangementKey` before
  the grants, so the grants never show in another account's order.
- **A sign-out** calls the window manager's `reset()` before the account changes.
- **Below 600px** the permission panel becomes a sheet over the workspace.

## Files

| File | Responsibility |
|---|---|
| `resources/data/accounts.json` | The "backend": demo accounts and their permission keys, read through a store `url`. |
| `store/Apps.mjs`, `model/App.mjs` | The navigation tree's catalog and its permission filter, over the engine's `Neo.desktop.store.Apps` and `Neo.desktop.model.App`. |
| `store/Permissions.mjs`, `view/PermissionList.mjs` | The panel that simulates the backend changing permissions. |
| `view/SignIn.mjs`, `view/AccountList.mjs` | The lock screen. |
| `view/Viewport.mjs`, `view/Taskbar.mjs` | The sign-in screen and the engine's `Neo.desktop.Container`, with the demo's panel, note and taskbar items. |
| `view/apps/*.mjs` | Each app's view, with its data. `GlassGrid` puts their grids on the window glass. |
| `store/Files.mjs`, `model/File.mjs`, `resources/data/files.json` | The shared files of Documents and the Recycle Bin. |
| `resources/data/help.md` | The Help app's guide. |
