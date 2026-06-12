---
id: 3603
title: 'Neo.data.Store needs a `fields:[]` config'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2022-12-15T17:08:31Z'
updatedAt: '2022-12-15T21:28:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3603'
author: maxrahder
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-12-15T21:28:56Z'
---
# Neo.data.Store needs a `fields:[]` config

Stores have models, and Neo.data.Model has a fields:[]. But if you _only_ needs to specify fields, which is the most common use case, then it's a chore to have to code the separate model class. Coding fields:[] as part of the store config would be a nice convenience, and would actually be better coupling for stores that have a 1..1 relationship to their view class. I.e., why code a (reusable) model class if it's only used in a single store?

## Timeline

- 2022-12-15T17:08:31Z @maxrahder added the `enhancement` label
### @tobiu - 2022-12-15T19:22:20Z

Hi @maxrahder, @Dinkh,

I just checked the code again. While a store does indeed not have a fields config, a model is defined like this inside the store class:
```
    beforeSetModel(value, oldValue) {
        oldValue?.destroy();

        return ClassSystemUtil.beforeSetInstance(value, Model);
    }
```


Meaning: we can pass a model class / module, an instance or a config object.

So, we  can do the following:

```
class MyStore extends Store {
    getConfig() {return {
        //...
        model: {
            fields: [/*...*/]
        }
    }}
}
```


While this is a little bit more typing, it does feel a bit cleaner, since fields is supposed to be a model config.

In case we would add it on a store level, to reduce the tiny overhead, there would need to be a check if the model config is null (otherwise throw an error). Then we would need to create the `model: {fields: []}` and delete store.fields afterwards to ensure there is no pointless overhead (memory usage).

Is this sufficient or would you still like to see the new config?

### @maxrahder - 2022-12-15T21:27:22Z

That's more consistent and logical really. And then if needed, people can set other model configs too. 

### @tobiu - 2022-12-15T21:28:56Z

deal.

we could open a new ticket though for view model stores, in case you would like to see anonymous stores in there.

- 2022-12-15T21:28:56Z @tobiu closed this issue

