---
id: 3994
title: Chrome permission "window-management" not working
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-02-06T13:10:06Z'
updatedAt: '2024-08-30T14:29:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3994'
author: Dinkh
commentsCount: 9
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-30T14:29:38Z'
---
# Chrome permission "window-management" not working

I am currently working on a multi-screen app and I need to ask the Chrome User for perssion for "window-management".

Current state in Chrome:
```
const state = await navigator.permissions.query(
    {name: 'window-management'} // => NOT working, but shoud
    {name: 'window-placement'}     // => works
);
```

Result for window-management:
window-managerment Error
Uncaught TypeError: Failed to execute 'query' on 'Permissions': Failed to read the 'name' property from 'PermissionDescriptor': The provided value 'window-management' is not a valid enum value of type PermissionName.

This might be especially interesting to  @michaelwasserman and @quisquous and @tomayac

## Timeline

- 2023-02-06T13:10:06Z @Dinkh added the `bug` label
### @tomayac - 2023-02-06T15:35:13Z

We are in the middle of changing the permission name, see https://crbug.com/1328581.

Meanwhile, here's a snippet ([deployed here](https://earthy-befitting-sedum.glitch.me/)) that should work on all browsers:

```js
document.querySelector('button').addEventListener('click', async () => {  
  let state;
  let permissionName;
  try {
    state = (
      await navigator.permissions.query({
        name: 'window-management',
      })
    ).state;
    permissionName = 'window-management'
  } catch (err) {    
    if (err.name === 'TypeError') {
      try {
        state = (
          await navigator.permissions.query({
            name: 'window-placement',
          })
        ).state;
        permissionName = 'window-placement'
      } catch (err) {
        if (err.name === 'TypeError') {
          state = 'Window management not supported';
        } else {
          state = `${err.name}: ${err.message}`;     
        }
      }
    } else {
      state = `${err.name}: ${err.message}`; 
    }
  }
  if ('request' in Permissions.prototype) {
    state = (await navigator.permissions.request({
      name: permissionName,
    })).state
  }
  document.querySelector('pre').textContent = state;
});
```

### @tomayac - 2023-02-07T14:49:35Z

Slightly improved:

```js
async function getWindowManagementPermissionState() {
  let state;
  // The new permission name.
  try {
    ({ state } = await navigator.permissions.query({
      name: "window-management",
    }));
  } catch (err) {
    if (err.name !== "TypeError") {
      return `${err.name}: ${err.message}`;
    }
    // The old permission name.
    try {
      ({ state } = await navigator.permissions.query({
        name: "window-placement",
      }));
    } catch (err) {
      if (err.name === "TypeError") {
        return "Window management not supported.";
      }
      return `${err.name}: ${err.message}`;
    }
  }
  return state;
}

document.querySelector("button").addEventListener("click", async () => {
  const state = await getWindowManagementPermissionState();
  document.querySelector("pre").textContent = state;
});
```

### @michaelwasserman - 2023-02-07T20:58:49Z

I'm guessing this is just a version issue, as window-management is rolling out in M111. @bradtriebwasser

### @Dinkh - 2023-02-08T09:41:22Z

@michaelwasserman thanks, that way it is the next update ;)

Current Version: 110.0.5481.78

### @tomayac - 2023-02-08T09:47:55Z

Note that many popular Chromium derivates like Samsung Internet stay a long time on outdated Chromium versions. I highly recommend a defensive code pattern (also [added to the article](https://developer.chrome.com/articles/multi-screen-window-placement/#:~:text=While%20browsers%20with,%7D)%3B)) if you use this API in production and you don't control what browsers people use. It's different in a production in-enterprise setting, where you can enforce a certain version. 

### @Dinkh - 2023-02-08T10:43:42Z

@tomayac I completely understand what you are saying. 
I'm not going to disable either of the permission queries. 

Currently my fallback is to query the single screen ( window.screen) and parse to a same object.
I.e. window.screen as currentScreen and screen[0].

This way I don't have to implement multiple approaches.

### @github-actions - 2024-08-30T02:27:04Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:04Z @github-actions added the `stale` label
### @tomayac - 2024-08-30T13:13:14Z

In case it's still an open question, this is the permission query that works today:

```js
await navigator.permissions.query({name: 'window-management'});
// PermissionStatus {name: 'window-management', state: 'prompt', onchange: null}
```



### @tobiu - 2024-08-30T14:29:38Z

@tomayac thanks for the update.

@Dinkh: i just tested it, and it works fine now.

See: https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query

=> the queries are working inside dedicated & shared workers, so there is nothing to do here (just tested it).
![Screenshot 2024-08-30 at 16 28 18](https://github.com/user-attachments/assets/7ec3d827-9f77-4a09-b0fa-7b625e26b7da)

no need for main thread based remote access (this would have been ugly anyways, since `PermissionStatus` is not spreadable & onchange can not get passed in postMessages).

- 2024-08-30T14:29:38Z @tobiu closed this issue

