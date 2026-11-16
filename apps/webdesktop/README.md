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
| Views  | `view/Launcher.mjs`, the start button's menu  | Bound to the apps store. They render what it keeps and never read a permission. |

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

## Files

| File | Responsibility |
|---|---|
| `resources/data/accounts.json` | The "backend": demo accounts and their permission keys, read through a store `url`. |
| `store/Apps.mjs`, `model/App.mjs` | The navigation tree and its permission filter. |
| `store/Permissions.mjs`, `view/PermissionList.mjs` | The panel that simulates the backend changing permissions. |
| `view/SignIn.mjs`, `view/AccountList.mjs` | The lock screen. |
| `view/Desktop.mjs`, `view/Launcher.mjs`, `view/Taskbar.mjs` | The signed-in desktop. |
