---
id: 1166
title: 'Breaking Change: Adjust the Neo.onStart() app starting points'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-09-03T17:34:29Z'
updatedAt: '2020-09-09T22:16:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1166'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-09-09T22:16:41Z'
---
# Breaking Change: Adjust the Neo.onStart() app starting points

Hello everyone,

this is the first breaking change in a long time, but I am afraid it needs to happen.

So far, our app.mjs files looked like:
```
import MainContainer from './view/MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/shareddialog/',
    mainView: MainContainer,
    name    : 'SharedDialog'
});
```

While this is perfectly fine for single page apps, it is actually not for the SharedWorkers context.

If we load our first app, we define Neo.onStart() and trigger it. Now if we load a different app, we will override Neo.onStart() and trigger the new method. Works fine as well. The problem starts, when we want to reload our first app window:

Browsers are "smart", so they will cache the module. In this case, Neo.onStart() will **not** get overridden again and we will trigger the last version of it.

Results are:
![Screenshot 2020-09-03 at 17 32 55](https://user-images.githubusercontent.com/1177434/92147855-f7f86400-ee1b-11ea-86d3-612eb11f0f0a.png)

(look close at the URLs)

To fix this, I will adjust the starting points to the following:
```
import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/shareddialog/',
    mainView: MainContainer,
    name    : 'SharedDialog'
});

export {onStart as onStart};
```

We will export the onStart() method and no longer use Neo.onStart() at all. This change ensures, that we will always get the correct method.

While this is easy to fix for the dev mode, it is a bit painful for the webpack based dist versions.

I found a way that works, although it is not exactly beautiful:
```
    onLoadApplication(data) {
        let me = this,
            path;

        if (data) {console.log(data);
            me.data = data;
            Neo.config.resourcesPath = data.resourcesPath;
        }

        if (!Neo.config.isExperimental) {
            path = data.path.replace('.js', '.mjs');
            path = path.substring(0) === '.' ? path : '.' + path;

            __webpack_require__.c[path].exports.onStart();

            //Neo.onStart();

            if (Neo.config.hash) {
                setTimeout(() => HashHistory.push(Neo.config.hash), 5);
            }
        } else {
            import(
                /* webpackIgnore: true */
                `../../${me.data.path}`).then(module => {
                    // Neo.onStart();
                    module.onStart();

                    if (Neo.config.hash) {
                        // short delay to ensure Component Controllers are ready
                        setTimeout(() => HashHistory.push(Neo.config.hash), 5);
                    }
                }
            );
        }
    }
```

I will adjust all starting points now and afterwards the build scripts (including the npx neo-app repo).

Best regards,
Tobi

## Timeline

- 2020-09-03T17:34:29Z @tobiu added the `enhancement` label
- 2020-09-03T17:34:30Z @tobiu assigned to @tobiu
- 2020-09-03T17:50:28Z @tobiu referenced in commit `fd33c26` - "Breaking Change: Adjust the Neo.onStart() app starting points #1166 => main logic (worker.App: onLoadApplication())"
- 2020-09-03T17:54:54Z @tobiu referenced in commit `914bfcf` - "#1166 Adjusted the starting points for all apps inside the apps folder"
- 2020-09-03T17:55:42Z @tobiu referenced in commit `7006ce1` - "#1166 Adjusted the starting point for the docs app"
- 2020-09-03T18:12:27Z @tobiu referenced in commit `7130847` - "#1166 Adjusted the starting points for all example apps"
- 2020-09-03T18:17:46Z @tobiu referenced in commit `adcb088` - "#1166 Adjusted the todo list tutorial"
- 2020-09-03T18:19:19Z @tobiu referenced in commit `20c814a` - "#1166 Updated the createApp script"
- 2020-09-03T18:39:11Z @tobiu referenced in commit `1becbc3` - "#1166 removed onStart from the Neo.mjs file"
- 2020-09-09T22:16:42Z @tobiu closed this issue

