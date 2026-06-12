---
id: 4553
title: 'Neo.data.connection.Fetch.request(url, ...) Uncaught type error if url is a string'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-07-18T08:20:32Z'
updatedAt: '2023-08-13T07:50:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4553'
author: gplanansky
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-18T09:28:44Z'
---
# Neo.data.connection.Fetch.request(url, ...) Uncaught type error if url is a string

Neo version 5.10.13 
class Neo.data.connection.Fetch
src/data/connection/Fetch.mjs

**Issue:**  

If Neo.data.connection.Fetch.request at line 94 ff (see below)
is called with a string valued url, say 'https://apis.is/earthquake/is',
it breaks at line 99 with an "Uncaught TypeError".

**Underlying problem:**   

If called via a remote method call,  the config parameter is always undefined.

**To reproduce:**   

call `Neo.Fetch.get('https://apis.is/earthquake/is')`

**Expected behavior**  

No type error; It should yield a promised fetch data result.

**Fix:**

Add logic so the request config parameter object exists, and
set its url property to the url parameter string.  See the diff below.

```
diff Fetch.mjs Fetch.mjs.orig
95,96d94
<         config = config || {};
<
101c99
<             config.url = config.url;
---
>             config.url = config;
```

**Desktop:**
 - Mac OS  Ventura 13.4.1
 - Chrome Version 114.0.5735.198 (Official Build) (arm64)

**Context:**

src/data/connection/Fetch.mjs:

```
    30      /**
    31       * @param {Object|String} url
    32       * @param {Object} config
    33       * @returns {Promise<any>}
    34       */
    35      get(url, config) {
    36          return this.request(url, config, 'get');
    37      }



    87      /**
    88       * @param {Object|String} url
    89       * @param {Object} config
    90       * @param {String} method
    91       * @param {Object} [data]
    92       * @returns {Promise<any>}
    93       */
    94      request(url, config, method, data) {
    95          if (!Neo.isString(url)) {
    96              config = url;
    97              url    = config.url;
    98          } else {
    99              config.url = config;
   100          }
   101
   102          return fetch(url, {
   103              body  : data,
   104              method: method || config.method
   105          }).then(resp => {
   106              let response = {
   107                  ok        : resp.ok,
   108                  redirected: resp.redirected,
   109                  request   : config,
   110                  status    : resp.status,
   111                  statusText: resp.statusText,
   112                  type      : resp.type,
   113                  url       : resp.url
   114              };
   115
   116              return resp[config.responseType || 'json']()
   117                  .then(data => {
   118                      response.data = data;
   119                  })
   120                  .then(() => (resp.ok ? response : Promise.reject(response)));
   121          })
   122      }
```
**What happens:**

A likely use case for Neo.data.connection.Fetch is a remote method Neo.Fetch.get(url) call.  That traces to line 35, with the config param being undefined.

Calling Neo.data.connection.Fetch.get(url,config) directly, it is certainly possible to use the config parameter object as a vehicle for parameters to fetch on line 102.

However the remote method call of `Neo.Fetch.get(url, config)`  consumes that second parameter in the remote message process, so the only argument that makes it to line 35  `get(url, config)` is the url; the config argument is undefined.

Hence in the remote method invocation, line 94 gets invoked as
`request(url, undefined, 'get')` .  

That's ok if the url parameter is an object, but if it is a string there ensues a type error:
`Uncaught TypeError: Cannot set properties of undefined (setting 'url')`



## Timeline

- 2023-07-18T08:20:32Z @gplanansky added the `bug` label
- 2023-07-18T09:26:43Z @tobiu referenced in commit `cb77cf5` - "Neo.data.connection.Fetch.request(url, ...) Uncaught type error if url is a string #4553"
### @tobiu - 2023-07-18T09:28:44Z

hi george!

a PR might have been fast than this level of detail (see the commit to fix it above) :)
appreciated though!

to be fair: i only tested it with this syntax so far:
`Neo.Fetch.get({url: 'myUrl', ...otherOptions})`

- 2023-07-18T09:28:45Z @tobiu closed this issue
### @gplanansky - 2023-07-19T05:12:43Z

Thanks!   Tested and works correctly with the string url syntax:
`Neo.Fetch.get('myUrl')`

Maybe also change line 99 from:
`config.url = config;`
to:
`config.url = url;`

### @gplanansky - 2023-08-13T07:50:15Z

src/Fetch.mjs     still do:

LINE 99   `config.url = config;`  --> `config.url = url;`

```
    request(url, config={}, method, data) {
        if (!Neo.isString(url)) {
            config = url;
            url    = config.url;
        } else {
99:       config.url = config;   
```



