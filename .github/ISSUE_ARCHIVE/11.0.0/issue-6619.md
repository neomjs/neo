---
id: 6619
title: >-
  EINVAL / EPERM error when running build script on Windows due to D:\System
  Volume Information
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2025-04-05T05:27:05Z'
updatedAt: '2025-10-22T22:54:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6619'
author: ahmad-su
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-19T03:02:59Z'
---
# EINVAL / EPERM error when running build script on Windows due to D:\System Volume Information

**Reported by:** @ahmad-su on 2025-04-05

### Description
When trying to build the `appworker` thread using the build script (`build-all` or `build-threads`), I get either:

- `EINVAL: invalid argument, stat 'D:\System Volume Information'`, or  
- `EPERM: operation not permitted, stat 'D:\System Volume Information'` (when not running as administrator)  

This occurs on Windows when building the Neo.mjs project.

### Cause
The script (likely through `ContextModule.resolveDependencies`) tries to access restricted system folders like `D:\System Volume Information`, which is not permitted.

---

### Environment
- OS: Windows 11  
- Node.js: v23.10  
- Neo.mjs: latest  
- Terminal: PowerShell  

---

### Additional Info
It appears that Webpack is attempting to resolve `.mjs` files across the entire project directory, including protected system folders. This causes permission errors on Windows.

---

### Log
```bash
neoapp buildThreads starting dist/production
assets by status 69.9 KiB [cached] 3 assets
orphan modules 202 KiB [orphan] 27 modules
runtime modules 3.37 KiB 8 modules
built modules 275 KiB [built]
  modules by path ./node_modules/neo.mjs/src/core/*.mjs 21.3 KiB
    ./node_modules/neo.mjs/src/core/Base.mjs 19.9 KiB [built] [code generated]
    ./node_modules/neo.mjs/src/core/IdGenerator.mjs 1.39 KiB [built] [code generated]
  modules by path ./node_modules/neo.mjs/src/util/*.mjs 10.1 KiB
    ./node_modules/neo.mjs/src/util/Function.mjs 5.31 KiB [built] [code generated]
    ./node_modules/neo.mjs/src/util/Array.mjs 4.76 KiB [built] [code generated]
  ./node_modules/neo.mjs/src/worker/App.mjs + 24 modules 212 KiB [built] [code generated]
  ../../../ lazy ^\.\/.*\.mjs$ include: (?:\/%7C\\)app.mjs$ exclude: (?:\/%7C\\)no...(truncated) 160 bytes [built] [code generated]
  ./node_modules/neo.mjs/src/remotes/Api.mjs 1.81 KiB [built] [code generated]
  ./node_modules/neo.mjs/src/vdom/Helper.mjs + 3 modules 30.1 KiB [built] [code generated]

ERROR in ../../../ lazy ^\.\/.*\.mjs$ include: (?:\/%7C\\)app.mjs$ exclude: (?:\/%7C\\)node_modules strict namespace object
EINVAL: invalid argument, stat 'D:\System Volume Information'
caused by plugins in ContextModule.resolveDependencies
Error: EINVAL: invalid argument, stat 'D:\System Volume Information'
 @ ./node_modules/neo.mjs/src/worker/App.mjs 301:19-306:13
```
---
### What I’ve Tried
- Reinstall dependencies & rebuild as administrator `npm i && npm run build-threads` : leads to EINVAL err
- Filter out the system folder in `neo.mjs/src/worker/App.mjs`, but looks like it's not the case:

```js
if (!path.includes('D:\\System')) {
    return import(
        /* webpackInclude: /(?:\/|\\)app.mjs$/ */
        /* webpackExclude: /(?:\/|\\)node_modules/ */
        /* webpackMode: "lazy" */
        `../../${path}.mjs`
    )
} 
```

Let me know if you need help reproducing it. Thanks

## Comments

### @ahmad-su - 2025-04-05 13:55

Update: Running the build command on git bash didnt solve the issue

### @tobiu - 2025-04-05 14:55

@ahmad-su Without having Windows installed, I can sadly not help too much on this one (flying blind).

I am sure though, that the problem is the following regex comment: `/* webpackInclude: /(?:\/|\\)app.mjs$/ */`.
For `/` based file systems it does work fine, for `\` it looks like it does not.

Let me explain what it is supposed to do:

For a webpack based build, the app worker => `worker/App.mjs` file is supposed to find all `app.mjs` files.

Inside the framework repo, it needs to go 2 folder levels up (repo root), and it can then find the target files inside the `apps`, `examples` & `docs` folder.

Inside a workspace, it needs to go 4 folder levels up, since neo is inside `node_modules/neo.mjs/`.

If it would try to go further up, there might be security related restrictions (permission denied).

The main idea is, that by fetching all `app.mjs` files, we do get split chunks & tree-shaking across multiple apps out of the box. E.g. if you would lazy-load a 2nd neo app into your website, there should be little overhead.

### @ahmad-su - 2025-04-05 16:11

Thanks for the insight @tobiu , the solution is just by nesting the project folder 1 level deeper. so ../.. will not accidentally go to D:\
But I'm still curious to modify the App.mjs to make it work wherever I place the project.

### @github-actions - 2025-07-05 02:53

This issue is stale because it has been open for 90 days with no activity.

### @github-actions - 2025-07-19 03:02

This issue was closed because it has been inactive for 14 days since being marked as stale.

