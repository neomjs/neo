---
id: 467
title: 'ES2020: Add optional chaining once possible (Webpack issue)'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-04-13T10:43:51Z'
updatedAt: '2021-06-28T08:39:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/467'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-28T08:39:17Z'
---
# ES2020: Add optional chaining once possible (Webpack issue)

In short:

```
const obj = {
  prop1: {
    prop2: {
      prop3: {
        prop4: {
          prop5: 5
        }
      }
    }
  }
}

obj.prop1 &&
  obj.prop1.prop2 &&
  obj.prop1.prop2 &&
  obj.prop1.prop2.prop3 &&
  obj.prop1.prop2.prop3.prop4 &&
  console.log(obj.prop1.prop2.prop3.prop4.prop5);
```

VS

```
const obj = {
  prop1: {
    prop2: {
      prop3: {
        prop4: {
          prop5: 5
        }
      }
    }
  }
}

console.log(obj?.prop1?.prop2?.prop3?.prop4?.prop5);
```

This can some boiler-plate code, but unfortunately, webpack can not handle it yet. Browsers already support it, but webpack wants to parse it.

> ERROR in ./apps/covid/view/TableContainerController.mjs 191:37
> Module parse failed: Unexpected token (191:37)
> You may need an appropriate loader to handle this file type, currently no loaders are configured to process this file. See https://webpack.js.org/concepts#loaders
> |         }
> | 
> >         me.loadHistoricalData(record?.countryInfo?.iso2 || 'all');

Since Babel is not an option for neo, we need to wait for this PR:

https://github.com/acornjs/acorn/pull/891

(Webpack relies on acornjs)

## Timeline

- 2020-04-13T10:43:51Z @tobiu added the `enhancement` label
- 2020-04-13T10:55:43Z @tobiu referenced in commit `2531822` - "Covid.view.TableContainerController: removed optional chaining again for now, see #467"
### @tobiu - 2020-04-13T11:03:01Z

https://caniuse.com/#search=optional%20chaining

### @dreyks - 2020-06-11T07:46:15Z

https://github.com/acornjs/acorn/pull/891 is merged, let's keep an eye on the releases

### @tobiu - 2020-06-11T08:17:35Z

Thanks for the heads up!

There are probably many spots inside the neo.mjs framework & demo apps code base where we can use it. Optional chaining can definitely help removing some boiler plate code (smaller file-size) as well as making the spots cleaner & easier to read.

Looking forward to it.

### @tobiu - 2021-06-28T08:39:17Z

just double-checked this one again and we are now finally good to use optional chaining.

will create new tickets in case i see spots.

- 2021-06-28T08:39:18Z @tobiu closed this issue

