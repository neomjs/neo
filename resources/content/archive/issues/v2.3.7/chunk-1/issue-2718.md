---
id: 2718
title: 'component.Base: modelData, model.Component: make it possible to change initial (nested) data props'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-08-29T15:56:40Z'
updatedAt: '2021-08-29T15:57:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2718'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-08-29T15:57:32Z'
---
# component.Base: modelData, model.Component: make it possible to change initial (nested) data props

Changing the default values of a `model.Component` is still too difficult.

Example: The calendar is using a `MainContainerModel` which has a `currentDate` data prop. In case we want to change the value of it, we have to create a config with the same name on the `MainContainer` and then use a two way binding.

In case we want to use the `calendar.weekview.MainContainer` as a standalone widget, we need to use the `MainContainerModel` to make it work. In this case, all relevant model data props would need configs and two way bindings as well. Way too much boiler plate code!

To resolve this, it would be nice to specify data we want to change like this:
```
model: {
    module: MainContainerModel,
    data  : {
        currentDate: new Date('2021-07-20')
    }
}
```

We want to change the values for specific (nested) data props without removing the other props we defined on class level. To do this, we need to use the `mergeConfig()` logic and deep merge the class based data with the instance config data.

In case we extend or use classes which already have a view model, we don't want to import the specific model base class for data changes again, so `component.Base` needs a `modelData` config to resolve this.

Example inside a container items array:
```
{
    module   : Calendar,
    flex     : 1,
    reference: 'calendar',

    calendarStoreConfig: {
        autoLoad: true,
        url     : '../../examples/calendar/basic/data/calendars.json'
    },

    eventStoreConfig: {
        autoLoad: true,
        url     : '../../examples/calendar/basic/data/events.json'
    },

    modelData: {
        currentDate: new Date('2021-07-20')
    }
}
```

## Timeline

- 2021-08-29T15:56:40Z @tobiu added the `enhancement` label
- 2021-08-29T15:56:41Z @tobiu assigned to @tobiu
- 2021-08-29T15:57:25Z @tobiu referenced in commit `8b50757` - "component.Base: modelData, model.Component: make it possible to change initial (nested) data props #2718"
- 2021-08-29T15:57:32Z @tobiu closed this issue

